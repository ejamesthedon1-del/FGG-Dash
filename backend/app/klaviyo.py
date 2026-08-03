"""Klaviyo API client (private key) for CEO lite control panel."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import HTTPException

from .config import get_settings

KLAVIYO_BASE = "https://a.klaviyo.com/api"
# Pin a stable revision; bump intentionally when adopting new fields.
KLAVIYO_REVISION = "2024-10-15"

# profile_count via additional-fields is rate-limited to ~1/s (15/m).
_PROFILE_COUNT_MIN_INTERVAL_S = 1.15
_PROFILE_COUNT_CACHE_TTL_S = 120.0
_profile_count_lock = asyncio.Lock()
_profile_count_last_at = 0.0
_profile_count_cache: Dict[str, Tuple[float, Optional[int]]] = {}


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


async def _fetch_list_profile_count(list_id: str) -> Optional[int]:
    """Get List + profile_count, paced + cached for Klaviyo's 1/s limit."""
    global _profile_count_last_at
    list_id = (list_id or "").strip()
    if not list_id:
        return None

    now = time.monotonic()
    cached = _profile_count_cache.get(list_id)
    if cached and (now - cached[0]) < _PROFILE_COUNT_CACHE_TTL_S:
        return cached[1]

    async with _profile_count_lock:
        now = time.monotonic()
        cached = _profile_count_cache.get(list_id)
        if cached and (now - cached[0]) < _PROFILE_COUNT_CACHE_TTL_S:
            return cached[1]

        wait = _PROFILE_COUNT_MIN_INTERVAL_S - (now - _profile_count_last_at)
        if wait > 0:
            await asyncio.sleep(wait)

        url = f"{KLAVIYO_BASE}/lists/{list_id}/"
        params = {"additional-fields[list]": "profile_count"}
        count: Optional[int] = None
        resolved = False
        for attempt in range(4):
            async with httpx.AsyncClient(timeout=40.0) as client:
                res = await client.get(url, headers=_headers(), params=params)
            _profile_count_last_at = time.monotonic()
            if res.status_code == 429:
                retry_after = res.headers.get("Retry-After")
                try:
                    delay = float(retry_after) if retry_after else 2.0 * (attempt + 1)
                except ValueError:
                    delay = 2.0 * (attempt + 1)
                await asyncio.sleep(min(max(delay, 1.0), 10.0))
                continue
            if res.status_code >= 400:
                break
            data = res.json()
            row = data.get("data") if isinstance(data, dict) else None
            if not isinstance(row, dict):
                break
            mapped = _map_list_item(row)
            count = mapped.get("profileCount")
            # Empty lists sometimes omit the field; treat as 0 when request ok.
            if count is None:
                count = 0
            resolved = True
            break

        if resolved:
            _profile_count_cache[list_id] = (time.monotonic(), count)
        return count


async def list_lists(limit: int = 50, *, include_counts: bool = True) -> Dict[str, Any]:
    # Collection omits profile_count. Singular Get List supports it, but
    # additional-fields[list]=profile_count is capped at ~1 req/sec.
    rows = await _get_pages("/lists/", limit=limit)
    items = [_map_list_item(r) for r in rows]
    if not include_counts:
        return {"lists": items}

    enriched: List[Dict[str, Any]] = []
    for item in items:
        list_id = str(item.get("id") or "")
        if item.get("profileCount") is not None:
            enriched.append(item)
            continue
        try:
            count = await _fetch_list_profile_count(list_id)
            enriched.append({**item, "profileCount": count})
        except HTTPException:
            enriched.append(item)
    return {"lists": enriched}


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
    # Skip profile counts here — /lists enriches them (rate-limited 1/s).
    lists = await list_lists(20, include_counts=False)
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
