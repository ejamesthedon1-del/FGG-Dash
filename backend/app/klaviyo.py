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
    include_page_size: bool = True,
) -> List[Dict[str, Any]]:
    """Fetch up to `limit` rows via cursor pagination.

    Most endpoints allow page[size] 1–10. Campaigns reject page[size] entirely.
    """
    want = max(1, min(int(limit or 1), 100))
    query = dict(params or {})
    if include_page_size:
        query["page[size]"] = min(PAGE_SIZE_MAX, want)
    rows: List[Dict[str, Any]] = []
    next_url: Optional[str] = None
    first = True
    while len(rows) < want:
        if first:
            data = await _get(path, query or None)
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
    count = attrs.get("profile_count")
    if count is None and "profileCount" in attrs:
        count = attrs.get("profileCount")
    try:
        profile_count = int(count) if count is not None else None
    except (TypeError, ValueError):
        profile_count = None
    return {
        "id": row.get("id"),
        "name": attrs.get("name"),
        "created": attrs.get("created"),
        "updated": attrs.get("updated"),
        "profileCount": profile_count,
    }


async def _get_list_with_count(list_id: str) -> Optional[Dict[str, Any]]:
    """Singular Get List supports additional-fields[list]=profile_count."""
    list_id = (list_id or "").strip()
    if not list_id:
        return None
    data = await _get(
        f"/lists/{list_id}/",
        params={"additional-fields[list]": "profile_count"},
    )
    row = data.get("data")
    if not isinstance(row, dict):
        return None
    return _map_list_item(row)


async def list_lists(limit: int = 50) -> Dict[str, Any]:
    # Collection endpoint usually omits profile_count; request it, then
    # enrich any missing counts via singular Get List.
    try:
        rows = await _get_pages(
            "/lists/",
            params={"additional-fields[list]": "profile_count"},
            limit=limit,
        )
    except HTTPException:
        rows = await _get_pages("/lists/", limit=limit)

    items = [_map_list_item(r) for r in rows]
    missing = [item for item in items if item.get("profileCount") is None]
    if missing:
        enriched: List[Dict[str, Any]] = []
        for item in items:
            if item.get("profileCount") is not None:
                enriched.append(item)
                continue
            try:
                full = await _get_list_with_count(str(item.get("id") or ""))
                enriched.append(full or item)
            except HTTPException:
                enriched.append(item)
        items = enriched
    return {"lists": items}


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
    # Campaigns API rejects page[size]; filter+cursor only.
    # Prefer channel filter; fall back to unfiltered if account rejects it.
    try:
        rows = await _get_pages(
            "/campaigns/",
            params={"filter": "equals(messages.channel,'email')"},
            limit=limit,
            include_page_size=False,
        )
    except HTTPException:
        rows = await _get_pages(
            "/campaigns/",
            limit=limit,
            include_page_size=False,
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
    try:
        campaigns = await list_campaigns(10)
    except HTTPException:
        campaigns = {"campaigns": []}
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
