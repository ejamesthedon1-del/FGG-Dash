"""Klaviyo API client (private key) for CEO lite control panel."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException

from .config import get_settings

KLAVIYO_BASE = "https://a.klaviyo.com/api"
# Pin a stable revision; bump intentionally when adopting new fields.
KLAVIYO_REVISION = "2024-10-15"


def klaviyo_configured() -> bool:
    return bool((get_settings().klaviyo_private_api_key or "").strip())


def _headers() -> Dict[str, str]:
    key = (get_settings().klaviyo_private_api_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Klaviyo is not configured (set KLAVIYO_PRIVATE_API_KEY).",
        )
    return {
        "Authorization": f"Klaviyo-API-Key {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "revision": KLAVIYO_REVISION,
    }


# Many collection endpoints only allow page[size] 1–10.
PAGE_SIZE_MAX = 10


async def _get(path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    url = path if path.startswith("http") else f"{KLAVIYO_BASE}{path}"
    async with httpx.AsyncClient(timeout=40.0) as client:
        res = await client.get(url, headers=_headers(), params=params)
    if res.status_code >= 400:
        raise HTTPException(
            status_code=400,
            detail=f"Klaviyo error ({res.status_code}): {res.text[:500]}",
        )
    data = res.json()
    return data if isinstance(data, dict) else {"data": data}


async def _get_pages(
    path: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Fetch up to `limit` rows, paging at Klaviyo's max page size (10)."""
    want = max(1, min(int(limit or 1), 100))
    page_size = min(PAGE_SIZE_MAX, want)
    query = dict(params or {})
    query["page[size]"] = page_size
    rows: List[Dict[str, Any]] = []
    next_url: Optional[str] = None
    first = True
    while len(rows) < want:
        if first:
            data = await _get(path, query)
            first = False
        else:
            if not next_url:
                break
            data = await _get(next_url)
        for row in data.get("data") or []:
            if isinstance(row, dict):
                rows.append(row)
                if len(rows) >= want:
                    break
        links = data.get("links") or {}
        nxt = links.get("next")
        next_url = nxt if isinstance(nxt, str) and nxt.strip() else None
        if not next_url:
            break
    return rows[:want]


async def _patch(path: str, body: Dict[str, Any]) -> Dict[str, Any]:
    url = path if path.startswith("http") else f"{KLAVIYO_BASE}{path}"
    async with httpx.AsyncClient(timeout=40.0) as client:
        res = await client.patch(url, headers=_headers(), json=body)
    if res.status_code >= 400:
        raise HTTPException(
            status_code=400,
            detail=f"Klaviyo error ({res.status_code}): {res.text[:500]}",
        )
    if not res.content:
        return {"ok": True}
    data = res.json()
    return data if isinstance(data, dict) else {"data": data}


def connection_status() -> Dict[str, Any]:
    return {
        "configured": klaviyo_configured(),
        "revision": KLAVIYO_REVISION,
    }


async def get_account() -> Dict[str, Any]:
    data = await _get("/accounts/")
    rows = data.get("data") or []
    if not rows:
        return {"configured": True, "account": None}
    row = rows[0]
    attrs = row.get("attributes") or {}
    contact = attrs.get("contact_information") or {}
    return {
        "configured": True,
        "account": {
            "id": row.get("id"),
            "name": contact.get("organization_name") or attrs.get("test_account"),
            "industry": attrs.get("industry"),
            "timezone": attrs.get("timezone"),
            "preferredCurrency": attrs.get("preferred_currency"),
            "publicApiKey": attrs.get("public_api_key"),
        },
    }


def _map_list_item(row: Dict[str, Any]) -> Dict[str, Any]:
    attrs = row.get("attributes") or {}
    return {
        "id": row.get("id"),
        "name": attrs.get("name"),
        "created": attrs.get("created"),
        "updated": attrs.get("updated"),
        "profileCount": (
            attrs.get("profile_count") if "profile_count" in attrs else None
        ),
    }


async def list_lists(limit: int = 50) -> Dict[str, Any]:
    rows = await _get_pages("/lists/", limit=limit)
    return {"lists": [_map_list_item(r) for r in rows]}


async def list_segments(limit: int = 50) -> Dict[str, Any]:
    rows = await _get_pages("/segments/", limit=limit)
    items = []
    for row in rows:
        attrs = row.get("attributes") or {}
        items.append(
            {
                "id": row.get("id"),
                "name": attrs.get("name"),
                "created": attrs.get("created"),
                "updated": attrs.get("updated"),
                "isActive": attrs.get("is_active"),
                "isProcessing": attrs.get("is_processing"),
            }
        )
    return {"segments": items}


async def list_campaigns(limit: int = 25) -> Dict[str, Any]:
    rows = await _get_pages(
        "/campaigns/",
        params={
            "filter": "equals(messages.channel,'email')",
            "sort": "-scheduled_at",
        },
        limit=limit,
    )
    items = []
    for row in rows:
        attrs = row.get("attributes") or {}
        items.append(
            {
                "id": row.get("id"),
                "name": attrs.get("name"),
                "status": attrs.get("status"),
                "archived": attrs.get("archived"),
                "channel": "email",
                "createdAt": attrs.get("created_at"),
                "scheduledAt": attrs.get("scheduled_at"),
                "sendTime": attrs.get("send_time"),
                "updatedAt": attrs.get("updated_at"),
            }
        )
    return {"campaigns": items}


async def list_flows(limit: int = 50) -> Dict[str, Any]:
    rows = await _get_pages(
        "/flows/",
        params={"sort": "-updated"},
        limit=limit,
    )
    items = []
    for row in rows:
        attrs = row.get("attributes") or {}
        items.append(
            {
                "id": row.get("id"),
                "name": attrs.get("name"),
                "status": attrs.get("status"),
                "archived": attrs.get("archived"),
                "triggerType": attrs.get("trigger_type"),
                "created": attrs.get("created"),
                "updated": attrs.get("updated"),
            }
        )
    return {"flows": items}


async def set_flow_status(flow_id: str, status: str) -> Dict[str, Any]:
    flow_id = (flow_id or "").strip()
    status = (status or "").strip().lower()
    if not flow_id:
        raise HTTPException(status_code=400, detail="flow_id required")
    if status not in ("live", "manual", "draft"):
        raise HTTPException(
            status_code=400,
            detail="status must be live, manual, or draft",
        )
    await _patch(
        f"/flows/{flow_id}/",
        {
            "data": {
                "type": "flow",
                "id": flow_id,
                "attributes": {"status": status},
            }
        },
    )
    return {"ok": True, "id": flow_id, "status": status}


async def list_metrics(limit: int = 50) -> Dict[str, Any]:
    rows = await _get_pages("/metrics/", limit=limit)
    items: List[Dict[str, Any]] = []
    for row in rows:
        attrs = row.get("attributes") or {}
        items.append(
            {
                "id": row.get("id"),
                "name": attrs.get("name"),
                "created": attrs.get("created"),
                "updated": attrs.get("updated"),
                "integration": (attrs.get("integration") or {}).get("name"),
            }
        )
    return {"metrics": items}


async def overview() -> Dict[str, Any]:
    account = await get_account()
    campaigns = await list_campaigns(10)
    flows = await list_flows(20)
    lists = await list_lists(20)
    live_flows = [
        f for f in flows.get("flows") or [] if (f.get("status") or "").lower() == "live"
    ]
    draft_campaigns = [
        c
        for c in campaigns.get("campaigns") or []
        if (c.get("status") or "").lower() in ("draft", "scheduled")
    ]
    return {
        "account": account.get("account"),
        "counts": {
            "lists": len(lists.get("lists") or []),
            "flows": len(flows.get("flows") or []),
            "liveFlows": len(live_flows),
            "recentCampaigns": len(campaigns.get("campaigns") or []),
            "draftOrScheduledCampaigns": len(draft_campaigns),
        },
        "recentCampaigns": campaigns.get("campaigns") or [],
        "flows": flows.get("flows") or [],
        "lists": lists.get("lists") or [],
    }
