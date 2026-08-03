"""Klaviyo API client (private key) for CEO lite control panel."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

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
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "revision": KLAVIYO_REVISION,
    }


# Many collection endpoints only allow page[size] 1–10.
PAGE_SIZE_MAX = 10


async def _get(
    path: str,
    params: Optional[Union[Dict[str, Any], Sequence[Tuple[str, Any]]]] = None,
) -> Dict[str, Any]:
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


async def _post(path: str, body: Dict[str, Any]) -> Dict[str, Any]:
    url = path if path.startswith("http") else f"{KLAVIYO_BASE}{path}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(url, headers=_headers(), json=body)
    if res.status_code >= 400:
        raise HTTPException(
            status_code=400,
            detail=f"Klaviyo error ({res.status_code}): {res.text[:800]}",
        )
    if not res.content:
        return {"ok": True}
    data = res.json()
    return data if isinstance(data, dict) else {"data": data}


async def _delete(path: str) -> Dict[str, Any]:
    url = path if path.startswith("http") else f"{KLAVIYO_BASE}{path}"
    async with httpx.AsyncClient(timeout=40.0) as client:
        res = await client.delete(url, headers=_headers())
    if res.status_code >= 400:
        raise HTTPException(
            status_code=400,
            detail=f"Klaviyo error ({res.status_code}): {res.text[:500]}",
        )
    return {"ok": True}


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
            "defaultSenderEmail": contact.get("default_sender_email"),
            "websiteUrl": contact.get("website_url"),
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


def _sms_consent_condition() -> Dict[str, Any]:
    return {
        "type": "profile-marketing-consent",
        "consent": {
            "channel": "sms",
            "can_receive_marketing": True,
            "consent_status": {"subscription": "subscribed"},
        },
    }


def _metric_count_condition(
    metric_id: str,
    *,
    operator: str,
    value: int,
    metric_filters: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    cond: Dict[str, Any] = {
        "type": "profile-metric",
        "metric_id": metric_id,
        "measurement": "count",
        "measurement_filter": {
            "type": "numeric",
            "operator": operator,
            "value": value,
        },
        "timeframe_filter": {"type": "date", "operator": "alltime"},
    }
    if metric_filters:
        cond["metric_filters"] = metric_filters
    return cond


async def create_segment(body: Dict[str, Any]) -> Dict[str, Any]:
    """Create a Klaviyo segment from a simple preset (or raw definition)."""
    name = str((body or {}).get("name") or "").strip()
    preset = str((body or {}).get("preset") or "").strip().lower()
    coupon_key = str((body or {}).get("couponKey") or "SMSentry").strip() or "SMSentry"
    list_id = str((body or {}).get("listId") or "").strip()
    raw_definition = (body or {}).get("definition")

    if not name:
        raise HTTPException(status_code=400, detail="name required")

    definition: Dict[str, Any]
    if isinstance(raw_definition, dict) and raw_definition.get("condition_groups"):
        definition = raw_definition
    elif preset in ("sms_subscribers", "sms"):
        groups: List[Dict[str, Any]] = [
            {"conditions": [_sms_consent_condition()]},
        ]
        if list_id:
            groups.append(
                {
                    "conditions": [
                        {
                            "type": "profile-group-membership",
                            "is_member": True,
                            "group_ids": [list_id],
                            "timeframe_filter": None,
                        }
                    ]
                }
            )
        definition = {"condition_groups": groups}
    elif preset in ("sms_coupon_unused", "sms_reengage"):
        # Proxy for unused discount: got SMSentry coupon assigned, no Placed Order.
        # Klaviyo cannot segment on coupon *redemption* directly.
        coupon_metric = await _find_metric_id(["Coupon Assigned"])
        order_metric = await _find_metric_id(["Placed Order"])
        if not coupon_metric:
            raise HTTPException(
                status_code=400,
                detail="Coupon Assigned metric not found in this Klaviyo account.",
            )
        if not order_metric:
            raise HTTPException(
                status_code=400,
                detail="Placed Order metric not found in this Klaviyo account.",
            )
        groups = [
            {"conditions": [_sms_consent_condition()]},
            {
                "conditions": [
                    _metric_count_condition(
                        coupon_metric,
                        operator="greater-than-or-equal",
                        value=1,
                        metric_filters=[
                            {
                                "property": "CouponKey",
                                "filter": {
                                    "type": "string",
                                    "operator": "equals",
                                    "value": coupon_key,
                                },
                            }
                        ],
                    )
                ]
            },
            {
                "conditions": [
                    _metric_count_condition(
                        order_metric,
                        operator="equals",
                        value=0,
                    )
                ]
            },
        ]
        if list_id:
            groups.append(
                {
                    "conditions": [
                        {
                            "type": "profile-group-membership",
                            "is_member": True,
                            "group_ids": [list_id],
                            "timeframe_filter": None,
                        }
                    ]
                }
            )
        definition = {"condition_groups": groups}
    else:
        raise HTTPException(
            status_code=400,
            detail="preset must be sms_subscribers or sms_coupon_unused (or pass definition)",
        )

    payload = {
        "data": {
            "type": "segment",
            "attributes": {
                "name": name,
                "definition": definition,
                "is_starred": False,
            },
        }
    }
    data = await _post("/segments/", payload)
    row = data.get("data") if isinstance(data.get("data"), dict) else {}
    attrs = row.get("attributes") or {}
    return {
        "ok": True,
        "segment": {
            "id": row.get("id"),
            "name": attrs.get("name") or name,
            "created": attrs.get("created"),
            "updated": attrs.get("updated"),
            "isActive": attrs.get("is_active"),
            "isProcessing": attrs.get("is_processing"),
        },
        "preset": preset or "custom",
        "note": (
            "sms_coupon_unused uses Coupon Assigned + zero Placed Orders "
            "(Klaviyo cannot filter exact coupon redemptions)."
            if preset in ("sms_coupon_unused", "sms_reengage")
            else None
        ),
    }


async def list_campaigns(limit: int = 25, channel: str = "email") -> Dict[str, Any]:
    # Campaigns API rejects page[size]; filter+cursor only.
    channel = (channel or "email").strip().lower()
    if channel not in ("email", "sms", "all"):
        channel = "email"
    # Prefer channel filter; fall back to unfiltered if account rejects it.
    rows: List[Dict[str, Any]] = []
    if channel == "all":
        rows = await _get_pages(
            "/campaigns/",
            limit=limit,
            include_page_size=False,
        )
    else:
        try:
            rows = await _get_pages(
                "/campaigns/",
                params={"filter": f"equals(messages.channel,'{channel}')"},
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
                "channel": channel if channel != "all" else None,
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


async def get_flow_detail(flow_id: str) -> Dict[str, Any]:
    """Flow definition + action statuses — used to diagnose silent welcome flows."""
    flow_id = (flow_id or "").strip()
    if not flow_id:
        raise HTTPException(status_code=400, detail="flow_id required")

    data = await _get(f"/flows/{flow_id}/")
    row = data.get("data")
    if not isinstance(row, dict):
        raise HTTPException(status_code=404, detail="Flow not found")
    attrs = row.get("attributes") or {}
    # Note: additional-fields[flow]=definition is not available on our pinned revision.

    resolved_triggers: List[Dict[str, Any]] = []
    # Reverse-lookup which metric triggers this flow.
    if str(attrs.get("trigger_type") or "").lower() == "metric":
        try:
            metrics = await list_metrics(100)
            for metric in metrics.get("metrics") or []:
                mid = str(metric.get("id") or "").strip()
                if not mid:
                    continue
                try:
                    rel = await _get(f"/metrics/{mid}/relationships/flow-triggers/")
                except HTTPException:
                    continue
                for rel_row in rel.get("data") or []:
                    if isinstance(rel_row, dict) and str(rel_row.get("id") or "") == flow_id:
                        resolved_triggers.append(
                            {
                                "type": "metric",
                                "id": mid,
                                "name": metric.get("name"),
                                "integration": metric.get("integration"),
                                "hasFilter": False,
                            }
                        )
                        break
                if resolved_triggers:
                    break
        except HTTPException:
            pass

    if not resolved_triggers and attrs.get("trigger_type"):
        resolved_triggers.append(
            {
                "type": attrs.get("trigger_type"),
                "id": None,
                "name": attrs.get("trigger_type"),
                "hasFilter": False,
            }
        )

    actions_out: List[Dict[str, Any]] = []

    # Authoritative per-message status from flow-actions.
    try:
        action_rows = await _get_pages(
            f"/flows/{flow_id}/flow-actions/",
            limit=50,
        )
        by_id = {str(a.get("id")): a for a in actions_out if a.get("id")}
        for row_a in action_rows:
            attrs_a = row_a.get("attributes") or {}
            aid = str(row_a.get("id") or "")
            mapped = by_id.get(aid)
            action_type = str(attrs_a.get("action_type") or "").lower()
            if mapped:
                mapped["status"] = attrs_a.get("status") or mapped.get("status")
                mapped["actionType"] = attrs_a.get("action_type")
            else:
                mapped = {
                    "id": aid,
                    "type": attrs_a.get("action_type"),
                    "status": attrs_a.get("status"),
                    "actionType": attrs_a.get("action_type"),
                }
                actions_out.append(mapped)

            # Enrich email/SMS actions with message content.
            if any(x in action_type for x in ("email", "sms", "send-email", "send-sms")):
                try:
                    msg_data = await _get(f"/flow-actions/{aid}/flow-messages/")
                    msgs = msg_data.get("data") or []
                    if msgs and isinstance(msgs[0], dict):
                        mattrs = msgs[0].get("attributes") or {}
                        content = mattrs.get("content") or {}
                        definition = mattrs.get("definition") or {}
                        mapped["name"] = mattrs.get("name") or mapped.get("name")
                        mapped["channel"] = mattrs.get("channel")
                        mapped["subject"] = (
                            content.get("subject")
                            or mapped.get("subject")
                        )
                        mapped["fromEmail"] = content.get("from_email") or mapped.get(
                            "fromEmail"
                        )
                        # SMS body can live under content.body or definition.body.
                        body = (
                            content.get("body")
                            or definition.get("body")
                            or mattrs.get("body")
                        )
                        if body:
                            mapped["body"] = body
                except HTTPException:
                    pass
    except HTTPException:
        pass

    warnings: List[str] = []
    flow_status = str(attrs.get("status") or "").lower()
    if flow_status != "live":
        warnings.append(f"Flow status is '{flow_status}', not live.")
    for act in actions_out:
        st = str(act.get("status") or "").lower()
        atype = str(act.get("type") or act.get("actionType") or "").lower()
        if any(x in atype for x in ("email", "sms", "send-email", "send-sms")):
            if st and st != "live":
                warnings.append(
                    f"Message action is '{st}' — even if the flow is live, it will not send automatically."
                )
            if "sms" in atype and not act.get("body"):
                warnings.append(
                    "SMS action has no readable message body via API — verify the text + coupon in Klaviyo."
                )
    trigger_names = " ".join(
        str(t.get("name") or "") for t in resolved_triggers
    ).lower()
    if "text messaging marketing" in trigger_names or "sms" in trigger_names:
        warnings.append(
            "Trigger is SMS marketing consent. The form must collect phone + explicit SMS opt-in; a phone field alone is not enough."
        )
    if any(t.get("hasFilter") for t in resolved_triggers):
        warnings.append("Trigger has filters — some signups may be excluded.")

    return {
        "flow": {
            "id": row.get("id"),
            "name": attrs.get("name"),
            "status": attrs.get("status"),
            "archived": attrs.get("archived"),
            "triggerType": attrs.get("trigger_type"),
            "created": attrs.get("created"),
            "updated": attrs.get("updated"),
            "triggers": resolved_triggers,
            "actions": actions_out,
        },
        "warnings": warnings,
    }


async def list_metrics(limit: int = 50) -> Dict[str, Any]:
    # Metrics API rejects page[size] (same class of issue as campaigns).
    rows = await _get_pages("/metrics/", limit=limit, include_page_size=False)
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


DEFAULT_TEMPLATE_HTML = """<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Email</title>
  </head>
  <body style="margin:0;padding:24px;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
      <tr>
        <td style="padding:28px 24px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            Hey {{ first_name|default:'there' }},
          </p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            Write your message here.
          </p>
          <p style="margin:24px 0 0;">
            <a href="https://example.com" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;font-size:14px;">
              Shop now
            </a>
          </p>
          <p style="margin:28px 0 0;font-size:12px;line-height:1.4;color:#888;">
            {% unsubscribe %}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _map_template(row: Dict[str, Any]) -> Dict[str, Any]:
    attrs = row.get("attributes") or {}
    return {
        "id": row.get("id"),
        "name": attrs.get("name"),
        "editorType": attrs.get("editor_type"),
        "html": attrs.get("html"),
        "text": attrs.get("text"),
        "created": attrs.get("created"),
        "updated": attrs.get("updated"),
    }


def _ensure_html(html: str) -> str:
    raw = (html or "").strip()
    if not raw:
        return DEFAULT_TEMPLATE_HTML
    lowered = raw.lower()
    if "<html" in lowered or "<body" in lowered:
        if "{% unsubscribe %}" not in lowered:
            return raw + "\n<p style=\"font-size:12px;color:#888\">{% unsubscribe %}</p>\n"
        return raw
    escaped = (
        raw.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br />\n")
    )
    return (
        "<!DOCTYPE html><html><body style=\"font-family:Helvetica,Arial,sans-serif;"
        "padding:24px;color:#111;\">"
        f"<div>{escaped}</div>"
        "<p style=\"margin-top:28px;font-size:12px;color:#888\">{% unsubscribe %}</p>"
        "</body></html>"
    )


async def list_templates(limit: int = 50) -> Dict[str, Any]:
    rows = await _get_pages("/templates/", limit=limit)
    return {"templates": [_map_template(r) for r in rows]}


async def get_template(template_id: str) -> Dict[str, Any]:
    template_id = (template_id or "").strip()
    if not template_id:
        raise HTTPException(status_code=400, detail="template_id required")
    data = await _get(f"/templates/{template_id}/")
    row = data.get("data")
    if not isinstance(row, dict):
        raise HTTPException(status_code=404, detail="Template not found")
    return {"template": _map_template(row)}


async def create_template(
    *,
    name: str,
    html: Optional[str] = None,
    text: Optional[str] = None,
) -> Dict[str, Any]:
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    body: Dict[str, Any] = {
        "data": {
            "type": "template",
            "attributes": {
                "name": name,
                "editor_type": "CODE",
                "html": _ensure_html(html or DEFAULT_TEMPLATE_HTML),
            },
        }
    }
    if text and str(text).strip():
        body["data"]["attributes"]["text"] = str(text).strip()
    data = await _post("/templates/", body)
    row = data.get("data")
    if not isinstance(row, dict):
        raise HTTPException(status_code=400, detail="Klaviyo did not return a template")
    return {"template": _map_template(row)}


async def update_template(
    template_id: str,
    *,
    name: Optional[str] = None,
    html: Optional[str] = None,
    text: Optional[str] = None,
) -> Dict[str, Any]:
    template_id = (template_id or "").strip()
    if not template_id:
        raise HTTPException(status_code=400, detail="template_id required")
    attrs: Dict[str, Any] = {}
    if name is not None and str(name).strip():
        attrs["name"] = str(name).strip()
    if html is not None:
        attrs["html"] = _ensure_html(html)
    if text is not None:
        attrs["text"] = str(text)
    if not attrs:
        raise HTTPException(status_code=400, detail="Nothing to update")
    data = await _patch(
        f"/templates/{template_id}/",
        {"data": {"type": "template", "id": template_id, "attributes": attrs}},
    )
    row = data.get("data")
    if isinstance(row, dict):
        return {"template": _map_template(row)}
    return await get_template(template_id)


async def delete_template(template_id: str) -> Dict[str, Any]:
    template_id = (template_id or "").strip()
    if not template_id:
        raise HTTPException(status_code=400, detail="template_id required")
    await _delete(f"/templates/{template_id}/")
    return {"ok": True, "id": template_id}


async def _resolve_sender(
    from_email: Optional[str],
    from_label: Optional[str],
) -> Tuple[str, str]:
    email = (from_email or "").strip()
    label = (from_label or "").strip()
    if email and label:
        return email, label
    account = await get_account()
    info = account.get("account") or {}
    if not email:
        email = str(info.get("defaultSenderEmail") or "").strip()
    if not label:
        name = info.get("name")
        label = str(name).strip() if isinstance(name, str) and name.strip() else "FGG"
    if not email:
        raise HTTPException(
            status_code=400,
            detail="fromEmail is required (Klaviyo account has no default sender).",
        )
    return email, label


async def schedule_email_campaign(body: Dict[str, Any]) -> Dict[str, Any]:
    """Create campaign + assign template + queue send job for a future send."""
    name = str((body or {}).get("name") or "").strip()
    template_id = str((body or {}).get("templateId") or "").strip()
    list_id = str((body or {}).get("listId") or "").strip()
    segment_id = str((body or {}).get("segmentId") or "").strip()
    subject = str((body or {}).get("subject") or "").strip()
    preview_text = str((body or {}).get("previewText") or "").strip()
    send_at = str((body or {}).get("sendAt") or "").strip()
    from_email, from_label = await _resolve_sender(
        (body or {}).get("fromEmail"),
        (body or {}).get("fromLabel"),
    )
    reply_to = str((body or {}).get("replyToEmail") or from_email).strip()

    if not name:
        raise HTTPException(status_code=400, detail="name required")
    if not template_id:
        raise HTTPException(status_code=400, detail="templateId required")
    if not list_id and not segment_id:
        raise HTTPException(status_code=400, detail="listId or segmentId required")
    if not subject:
        raise HTTPException(status_code=400, detail="subject required")
    if not send_at:
        raise HTTPException(status_code=400, detail="sendAt required (ISO datetime)")

    included = [list_id or segment_id]
    create_payload = {
        "data": {
            "type": "campaign",
            "attributes": {
                "name": name,
                "audiences": {"included": included, "excluded": []},
                "send_strategy": {
                    "method": "static",
                    "options_static": {"datetime": send_at, "is_local": False},
                },
                "campaign-messages": {
                    "data": [
                        {
                            "type": "campaign-message",
                            "attributes": {
                                "definition": {
                                    "channel": "email",
                                    "label": subject,
                                    "content": {
                                        "subject": subject,
                                        "preview_text": preview_text,
                                        "from_email": from_email,
                                        "from_label": from_label,
                                        "reply_to_email": reply_to,
                                    },
                                }
                            },
                        }
                    ]
                },
            },
        }
    }
    created = await _post("/campaigns/", create_payload)
    campaign = created.get("data") if isinstance(created.get("data"), dict) else {}
    campaign_id = str(campaign.get("id") or "")
    if not campaign_id:
        raise HTTPException(status_code=400, detail="Campaign create failed")

    message_id = ""
    rel = (campaign.get("relationships") or {}).get("campaign-messages") or {}
    rel_data = rel.get("data")
    if isinstance(rel_data, list) and rel_data:
        message_id = str(rel_data[0].get("id") or "")
    elif isinstance(rel_data, dict):
        message_id = str(rel_data.get("id") or "")
    if not message_id:
        # Fallback: fetch messages for the campaign.
        msgs = await _get(f"/campaigns/{campaign_id}/campaign-messages/")
        rows = msgs.get("data") or []
        if rows and isinstance(rows[0], dict):
            message_id = str(rows[0].get("id") or "")
    if not message_id:
        raise HTTPException(
            status_code=400,
            detail="Campaign created but no message id returned; open it in Klaviyo.",
        )

    await _post(
        "/campaign-message-assign-template/",
        {
            "data": {
                "type": "campaign-message",
                "id": message_id,
                "relationships": {
                    "template": {
                        "data": {"type": "template", "id": template_id},
                    }
                },
            }
        },
    )

    send_job = await _post(
        "/campaign-send-jobs/",
        {"data": {"type": "campaign-send-job", "id": campaign_id}},
    )

    return {
        "ok": True,
        "campaignId": campaign_id,
        "messageId": message_id,
        "templateId": template_id,
        "sendAt": send_at,
        "sendJob": send_job.get("data") if isinstance(send_job, dict) else None,
    }


DEFAULT_SMS_REENGAGE_BODY = (
    "Still want your 20% off?\n\n"
    "Your code:\n"
    "{% coupon_code 'SMSentry' %}\n\n"
    "Shop now: www.sinnerstestimony.com"
)


async def send_sms_campaign(body: Dict[str, Any]) -> Dict[str, Any]:
    """Create an SMS campaign and queue send (now or scheduled)."""
    name = str((body or {}).get("name") or "").strip()
    list_id = str((body or {}).get("listId") or "").strip()
    segment_id = str((body or {}).get("segmentId") or "").strip()
    message = str((body or {}).get("body") or "").strip()
    send_at = str((body or {}).get("sendAt") or "").strip()
    send_now = bool((body or {}).get("sendNow"))
    confirm = bool((body or {}).get("confirm"))
    shorten_links = (body or {}).get("shortenLinks")
    add_org_prefix = (body or {}).get("addOrgPrefix")
    add_opt_out = (body or {}).get("addOptOutLanguage")

    if not name:
        raise HTTPException(status_code=400, detail="name required")
    if not list_id and not segment_id:
        raise HTTPException(status_code=400, detail="listId or segmentId required")
    if not message:
        raise HTTPException(status_code=400, detail="body required")
    if len(message) > 1000:
        raise HTTPException(status_code=400, detail="SMS body too long (max 1000 chars)")
    if send_now and not confirm:
        raise HTTPException(
            status_code=400,
            detail="confirm must be true to send SMS immediately",
        )
    if not send_now and not send_at:
        raise HTTPException(
            status_code=400,
            detail="sendAt required unless sendNow is true",
        )

    if send_now:
        send_strategy: Dict[str, Any] = {"method": "immediate"}
    else:
        send_strategy = {
            "method": "static",
            "options_static": {"datetime": send_at, "is_local": False},
        }

    create_payload = {
        "data": {
            "type": "campaign",
            "attributes": {
                "name": name,
                "audiences": {
                    "included": [list_id or segment_id],
                    "excluded": [],
                },
                "send_strategy": send_strategy,
                "send_options": {"use_smart_sending": True},
                "campaign-messages": {
                    "data": [
                        {
                            "type": "campaign-message",
                            "attributes": {
                                "definition": {
                                    "channel": "sms",
                                    "render_options": {
                                        "shorten_links": True
                                        if shorten_links is None
                                        else bool(shorten_links),
                                        "add_org_prefix": True
                                        if add_org_prefix is None
                                        else bool(add_org_prefix),
                                        "add_info_link": False,
                                        "add_opt_out_language": True
                                        if add_opt_out is None
                                        else bool(add_opt_out),
                                    },
                                    "content": {"body": message},
                                }
                            },
                        }
                    ]
                },
            },
        }
    }

    created = await _post("/campaigns/", create_payload)
    campaign = created.get("data") if isinstance(created.get("data"), dict) else {}
    campaign_id = str(campaign.get("id") or "")
    if not campaign_id:
        raise HTTPException(status_code=400, detail="SMS campaign create failed")

    send_job = await _post(
        "/campaign-send-jobs/",
        {"data": {"type": "campaign-send-job", "id": campaign_id}},
    )

    return {
        "ok": True,
        "campaignId": campaign_id,
        "channel": "sms",
        "sendNow": send_now,
        "sendAt": None if send_now else send_at,
        "sendJob": send_job.get("data") if isinstance(send_job, dict) else None,
    }


async def _find_metric_id(candidates: List[str]) -> Optional[str]:
    metrics = await list_metrics(100)
    rows = metrics.get("metrics") or []
    lowered = [(str(m.get("name") or ""), str(m.get("id") or "")) for m in rows]
    for want in candidates:
        w = want.lower()
        for name, mid in lowered:
            if name.lower() == w and mid:
                return mid
    for want in candidates:
        w = want.lower()
        for name, mid in lowered:
            if w in name.lower() and mid:
                return mid
    return None


async def create_simple_flow(body: Dict[str, Any]) -> Dict[str, Any]:
    """Create a draft list- or metric-triggered flow with one delayed email."""
    preset = str((body or {}).get("preset") or "welcome").strip().lower()
    name = str((body or {}).get("name") or "").strip()
    template_id = str((body or {}).get("templateId") or "").strip()
    subject = str((body or {}).get("subject") or "").strip()
    preview_text = str((body or {}).get("previewText") or "").strip()
    list_id = str((body or {}).get("listId") or "").strip()
    delay_hours = (body or {}).get("delayHours")
    from_email, from_label = await _resolve_sender(
        (body or {}).get("fromEmail"),
        (body or {}).get("fromLabel"),
    )

    if preset not in ("welcome", "abandoned_cart", "post_purchase"):
        raise HTTPException(
            status_code=400,
            detail="preset must be welcome, abandoned_cart, or post_purchase",
        )
    if not template_id:
        raise HTTPException(status_code=400, detail="templateId required")
    if not subject:
        raise HTTPException(status_code=400, detail="subject required")

    try:
        hours = int(delay_hours) if delay_hours is not None else {
            "welcome": 0,
            "abandoned_cart": 4,
            "post_purchase": 24,
        }[preset]
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="delayHours must be an integer")
    hours = max(0, min(hours, 24 * 30))

    if preset == "welcome":
        if not list_id:
            raise HTTPException(status_code=400, detail="listId required for welcome")
        if not name:
            name = "Welcome series"
        triggers: List[Dict[str, Any]] = [{"type": "list", "id": list_id}]
    elif preset == "abandoned_cart":
        metric_id = await _find_metric_id(
            ["Started Checkout", "Checkout Started", "Added to Cart"]
        )
        if not metric_id:
            raise HTTPException(
                status_code=400,
                detail="No checkout/cart metric found in Klaviyo for abandoned_cart.",
            )
        if not name:
            name = "Abandoned cart"
        triggers = [{"type": "metric", "id": metric_id}]
    else:
        metric_id = await _find_metric_id(["Placed Order", "Ordered Product"])
        if not metric_id:
            raise HTTPException(
                status_code=400,
                detail="No Placed Order metric found in Klaviyo for post_purchase.",
            )
        if not name:
            name = "Post-purchase"
        triggers = [{"type": "metric", "id": metric_id}]

    delay_id = "action-delay"
    email_id = "action-email"
    actions: List[Dict[str, Any]] = []
    entry_id = email_id
    if hours > 0:
        entry_id = delay_id
        actions.append(
            {
                "temporary_id": delay_id,
                "type": "time-delay",
                "links": {"next": email_id},
                "data": {
                    "unit": "hours",
                    "value": hours,
                    "secondary_value": 0,
                    "timezone": "profile",
                    "delay_until_time": None,
                    "delay_until_weekdays": None,
                },
            }
        )
    actions.append(
        {
            "temporary_id": email_id,
            "type": "send-email",
            "links": {"next": None},
            "data": {
                "status": "draft",
                "message": {
                    "from_email": from_email,
                    "from_label": from_label,
                    "reply_to_email": from_email,
                    "subject_line": subject,
                    "preview_text": preview_text,
                    "template_id": template_id,
                    "smart_sending_enabled": True,
                    "transactional": False,
                    "add_tracking_params": False,
                    "name": subject,
                },
            },
        }
    )

    payload = {
        "data": {
            "type": "flow",
            "attributes": {
                "name": name,
                "definition": {
                    "triggers": triggers,
                    "profile_filter": None,
                    "actions": actions,
                    "entry_action_id": entry_id,
                },
            },
        }
    }
    data = await _post("/flows/", payload)
    row = data.get("data") if isinstance(data.get("data"), dict) else {}
    attrs = row.get("attributes") or {}
    return {
        "ok": True,
        "flow": {
            "id": row.get("id"),
            "name": attrs.get("name") or name,
            "status": attrs.get("status") or "draft",
            "triggerType": attrs.get("trigger_type"),
            "created": attrs.get("created"),
            "updated": attrs.get("updated"),
        },
        "preset": preset,
    }


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
