from __future__ import annotations

import asyncio
import copy
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from . import order_flow_store
from .shopify import get_shopify_client
from .shopify_color import PRODUCT_COLOR_GRAPHQL, resolve_product_color

# Short TTL so Shopify isn't rebuilt on every page + badge poll.
_ORDER_FLOW_CACHE_TTL_SEC = 45.0
_order_flow_cache: Dict[int, Tuple[float, Dict[str, Any]]] = {}
_order_flow_inflight: Dict[int, asyncio.Task[Dict[str, Any]]] = {}


def invalidate_order_flow_cache() -> None:
    """Clear cached Order Flow payloads (call after stage/risk/notes writes)."""
    _order_flow_cache.clear()

BRANDS = ("live-don", "sinners-testimony")

BRAND_LABELS = {
    "live-don": "Livdon",
    "sinners-testimony": "Sinners Testimony",
}

STAGE_LABELS = {
    "needs_blanks": "Needs blanks",
    "blanks_ordered": "Ordered",
    "in_production": "In production",
    "ready_to_ship": "Ready to ship",
    "shipped": "Shipped",
}

ORDERS_QUERY = f"""
query OrderFlowOrders($queryString: String!, $cursor: String) {{
  orders(first: 50, after: $cursor, sortKey: CREATED_AT, reverse: true, query: $queryString) {{
    pageInfo {{
      hasNextPage
      endCursor
    }}
    edges {{
      node {{
        id
        name
        createdAt
        cancelledAt
        email
        phone
        note
        tags
        displayFinancialStatus
        displayFulfillmentStatus
        customer {{
          displayName
          firstName
          lastName
          email
        }}
        shippingAddress {{
          name
          address1
          address2
          city
          provinceCode
          countryCodeV2
          zip
        }}
        billingAddress {{
          name
          address1
          address2
          city
          provinceCode
          countryCodeV2
          zip
        }}
        currentTotalPriceSet {{
          shopMoney {{
            amount
            currencyCode
          }}
        }}
        risk {{
          recommendation
          assessments {{
            riskLevel
            facts {{
              description
              sentiment
            }}
          }}
        }}
        lineItems(first: 50) {{
          edges {{
            node {{
              id
              name
              title
              quantity
              sku
              variantTitle
              variant {{
                id
                title
                selectedOptions {{
                  name
                  value
                }}
              }}
              product {{
                {PRODUCT_COLOR_GRAPHQL}
              }}
            }}
          }}
        }}
      }}
    }}
  }}
}}
"""


_RISK_LEVEL_RANK = {
    "HIGH": 3,
    "MEDIUM": 2,
    "LOW": 1,
    "NONE": 0,
    "PENDING": 0,
}


def _extract_risk(node: Dict[str, Any]) -> Dict[str, Any]:
    risk = node.get("risk") or {}
    recommendation = str(risk.get("recommendation") or "NONE").upper()
    facts: List[str] = []
    highest = "NONE"
    highest_rank = -1
    for assessment in risk.get("assessments") or []:
        if not isinstance(assessment, dict):
            continue
        level = str(assessment.get("riskLevel") or "NONE").upper()
        rank = _RISK_LEVEL_RANK.get(level, 0)
        if rank > highest_rank:
            highest_rank = rank
            highest = level
        for fact in assessment.get("facts") or []:
            if not isinstance(fact, dict):
                continue
            desc = str(fact.get("description") or "").strip()
            if desc and desc not in facts:
                facts.append(desc)
            if len(facts) >= 12:
                break
    # Only HIGH risk enters the review queue (not MEDIUM / INVESTIGATE-only).
    needs_review = highest == "HIGH"
    return {
        "riskRecommendation": recommendation,
        "riskLevel": highest,
        "riskFacts": facts,
        "needsRiskReview": needs_review,
    }


def _parse_option(options: List[Dict[str, Any]], *names: str) -> Optional[str]:
    lowered = {str(o.get("name") or "").strip().lower(): str(o.get("value") or "").strip() for o in options}
    for name in names:
        if lowered.get(name):
            return lowered[name]
    return None


def _customer_name(node: Dict[str, Any]) -> str:
    customer = node.get("customer") or {}
    if customer.get("displayName"):
        return str(customer["displayName"])
    first = (customer.get("firstName") or "").strip()
    last = (customer.get("lastName") or "").strip()
    combined = f"{first} {last}".strip()
    if combined:
        return combined
    shipping = node.get("shippingAddress") or {}
    if shipping.get("name"):
        return str(shipping["name"])
    return node.get("email") or "—"


def _expected_ship_date(node: Dict[str, Any]) -> Optional[str]:
    """
    Expected ship date when available on the order.
    Note: fulfillmentOrders.fulfillAt needs extra Shopify scopes; we avoid that field
    so both stores load. Optional fallback: tag like ship_by:YYYY-MM-DD.
    """
    tags = node.get("tags") or []
    tag_list = tags if isinstance(tags, list) else [t.strip() for t in str(tags).split(",")]
    for tag in tag_list:
        t = str(tag).strip()
        lower = t.lower()
        if lower.startswith("ship_by:"):
            return t.split(":", 1)[1].strip()[:10]
        if lower.startswith("shipby:"):
            return t.split(":", 1)[1].strip()[:10]
    return None


def _order_age_days(order_date: Optional[str], today: str) -> int:
    if not order_date:
        return 0
    try:
        return (datetime.fromisoformat(today).date() - datetime.fromisoformat(order_date[:10]).date()).days
    except Exception:
        return 0


def _deadline_state(expected: Optional[str], stage: str, today: str) -> str:
    if stage == "shipped" or not expected:
        return "none"
    if expected < today:
        return "overdue"
    if expected == today:
        return "due_today"
    # within 2 days
    try:
        exp = datetime.fromisoformat(expected).date()
        t = datetime.fromisoformat(today).date()
        if 0 < (exp - t).days <= 2:
            return "upcoming"
    except Exception:
        pass
    return "ok"


def _shopify_is_shipped(fulfillment_status: Optional[str]) -> bool:
    status = (fulfillment_status or "").upper()
    return status in {"FULFILLED", "SHIPPED"}


def _line_items(node: Dict[str, Any]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for edge in (node.get("lineItems") or {}).get("edges") or []:
        li = edge.get("node") or {}
        variant = li.get("variant") or {}
        options = variant.get("selectedOptions") or []
        size = _parse_option(options, "size") or None
        variant_title = li.get("variantTitle") or variant.get("title") or ""
        if not size and variant_title and " / " in variant_title:
            size = variant_title.split("/")[-1].strip() or None
        elif not size and variant_title and variant_title.lower() not in {"default title"}:
            # Size-only variants (Livdon painters) use variantTitle as size
            maybe = variant_title.strip()
            if maybe.lower() in {"small", "medium", "large", "xl", "2xl", "3xl"} or len(maybe) <= 4:
                size = maybe
        color = resolve_product_color(
            li.get("product"),
            selected_options=options,
            variant_title=variant_title,
        )
        items.append(
            {
                "id": li.get("id"),
                "product": li.get("title") or li.get("name") or "—",
                "productId": ((li.get("product") or {}).get("id")) or "",
                "variant": variant_title or "—",
                "color": color or "—",
                "size": size or "—",
                "quantity": int(li.get("quantity") or 0),
                "sku": li.get("sku") or "",
            }
        )
    return items


def _primary_item_summary(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not items:
        return {"product": "—", "variant": "—", "color": "—", "size": "—", "quantity": 0}
    if len(items) == 1:
        return items[0]
    total_qty = sum(i["quantity"] for i in items)
    return {
        "product": f"{items[0]['product']} (+{len(items) - 1} more)",
        "variant": items[0]["variant"],
        "color": items[0]["color"],
        "size": items[0]["size"],
        "quantity": total_qty,
    }


async def fetch_brand_orders(brand: str, days: int = 90) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """Fetch recent orders for a brand (includes cancelled for denied queue). Returns (nodes, error)."""
    try:
        client = get_shopify_client(brand)
    except RuntimeError as exc:
        return [], str(exc)

    since = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    query_string = f"created_at:>={since} status:any"
    cursor: Optional[str] = None
    nodes: List[Dict[str, Any]] = []

    try:
        for page_i in range(10):  # hard cap pages
            if page_i > 0:
                # Brief pause between pages; Shopify client already retries on throttle.
                await asyncio.sleep(0.12)
            data = await client.graphql(
                ORDERS_QUERY,
                {"queryString": query_string, "cursor": cursor},
            )
            block = data.get("orders") or {}
            for edge in block.get("edges") or []:
                node = edge.get("node") or {}
                if node.get("id"):
                    nodes.append(node)
            page = block.get("pageInfo") or {}
            if not page.get("hasNextPage"):
                break
            cursor = page.get("endCursor")
            if not cursor:
                break
        return nodes, None
    except Exception as exc:
        return nodes, str(exc)


def merge_order(
    brand: str,
    node: Dict[str, Any],
    stored: Dict[str, Any],
    today: str,
) -> Dict[str, Any]:
    shopify_id = str(node["id"])
    fulfillment = node.get("displayFulfillmentStatus")
    record = stored.get(f"{brand}::{shopify_id}") if stored else None
    if not isinstance(record, dict):
        record = {}

    stage = order_flow_store.normalize_stage(record.get("stage") or "needs_blanks")
    auto_shipped = False
    if _shopify_is_shipped(fulfillment):
        if stage != "shipped":
            auto_shipped = True
        stage = "shipped"

    items = _line_items(node)
    summary = _primary_item_summary(items)
    expected = _expected_ship_date(node)
    money = ((node.get("currentTotalPriceSet") or {}).get("shopMoney")) or {}
    order_date = str(node.get("createdAt") or "")[:10]
    age_days = _order_age_days(order_date, today)
    open_order = stage != "shipped" and not node.get("cancelledAt")
    # Open orders older than 7 days are high priority (red).
    high_priority = open_order and age_days > 7
    # Day 3–7: early warning before late/high priority.
    early_warning = open_order and not high_priority and age_days >= 3

    risk = _extract_risk(node)
    risk_review = order_flow_store.get_risk_review(record)
    risk_status = None
    if isinstance(risk_review, dict):
        status = str(risk_review.get("status") or "").lower()
        if status in {"approved", "denied"}:
            risk_status = status

    pending_hold = bool(
        risk["needsRiskReview"]
        and risk_status is None
        and not node.get("cancelledAt")
    )

    return {
        "id": shopify_id,
        "brand": brand,
        "brandLabel": BRAND_LABELS.get(brand, brand),
        "orderNumber": node.get("name") or "—",
        "customer": _customer_name(node),
        "email": node.get("email") or (node.get("customer") or {}).get("email") or "",
        "phone": node.get("phone") or "",
        "product": summary["product"],
        "variant": summary.get("variant") or "—",
        "color": summary.get("color") or "—",
        "size": summary.get("size") or "—",
        "quantity": summary.get("quantity") or 0,
        "lineItems": items,
        "orderDate": order_date,
        "orderDateTime": node.get("createdAt"),
        "orderAgeDays": age_days,
        "highPriority": high_priority,
        "earlyWarning": early_warning,
        "expectedShipDate": expected,
        "deadlineState": _deadline_state(expected, stage, today),
        "stage": stage,
        "stageLabel": STAGE_LABELS.get(stage, stage),
        "shopifyFinancialStatus": node.get("displayFinancialStatus"),
        "shopifyFulfillmentStatus": fulfillment,
        "cancelledAt": node.get("cancelledAt"),
        "autoShippedFromShopify": auto_shipped,
        "notes": record.get("notes") or "",
        "blanksReceipt": order_flow_store.blanks_receipt_meta(
            order_flow_store.get_blanks_receipt(record)
        ),
        "history": order_flow_store.slim_history_for_list(record.get("history") or []),
        "shopifyNote": node.get("note") or "",
        "tags": node.get("tags") or [],
        "total": {
            "amount": float(money.get("amount") or 0),
            "currency": money.get("currencyCode") or "USD",
        },
        "shippingAddress": node.get("shippingAddress") or {},
        "billingAddress": node.get("billingAddress") or {},
        "updatedAt": record.get("updatedAt"),
        "riskRecommendation": risk["riskRecommendation"],
        "riskLevel": risk["riskLevel"],
        "riskFacts": risk["riskFacts"],
        "needsRiskReview": risk["needsRiskReview"],
        "riskStatus": risk_status,
        "riskReview": risk_review,
        "riskPendingHold": pending_hold,
        "suppliesApplied": order_flow_store.get_supplies_applied(record),
    }


def _order_from_denied_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """Build a lightweight order card from a stored denied decision."""
    brand = str(record.get("brand") or "")
    review = order_flow_store.get_risk_review(record) or {}
    snapshot = review.get("snapshot") if isinstance(review.get("snapshot"), dict) else {}
    return {
        "id": record.get("shopifyOrderId") or "",
        "brand": brand,
        "brandLabel": BRAND_LABELS.get(brand, brand),
        "orderNumber": snapshot.get("orderNumber") or record.get("orderName") or "—",
        "customer": snapshot.get("customer") or "—",
        "email": snapshot.get("email") or "",
        "phone": snapshot.get("phone") or "",
        "product": snapshot.get("product") or "—",
        "variant": snapshot.get("variant") or "—",
        "color": snapshot.get("color") or "—",
        "size": snapshot.get("size") or "—",
        "quantity": snapshot.get("quantity") or 0,
        "lineItems": snapshot.get("lineItems") or [],
        "orderDate": snapshot.get("orderDate") or "",
        "orderDateTime": snapshot.get("orderDateTime"),
        "orderAgeDays": snapshot.get("orderAgeDays") or 0,
        "highPriority": False,
        "earlyWarning": False,
        "expectedShipDate": None,
        "deadlineState": "none",
        "stage": "needs_blanks",
        "stageLabel": STAGE_LABELS["needs_blanks"],
        "shopifyFinancialStatus": snapshot.get("shopifyFinancialStatus"),
        "shopifyFulfillmentStatus": snapshot.get("shopifyFulfillmentStatus"),
        "cancelledAt": snapshot.get("cancelledAt") or review.get("decidedAt"),
        "notes": record.get("notes") or "",
        "blanksReceipt": None,
        "history": order_flow_store.slim_history_for_list(record.get("history") or []),
        "shopifyNote": "",
        "tags": snapshot.get("tags") or [],
        "total": snapshot.get("total") or {"amount": 0, "currency": "USD"},
        "shippingAddress": snapshot.get("shippingAddress") or {},
        "billingAddress": snapshot.get("billingAddress") or {},
        "updatedAt": record.get("updatedAt"),
        "riskRecommendation": snapshot.get("riskRecommendation") or "CANCEL",
        "riskLevel": snapshot.get("riskLevel") or "HIGH",
        "riskFacts": snapshot.get("riskFacts") or [],
        "needsRiskReview": True,
        "riskStatus": "denied",
        "riskReview": review,
        "riskPendingHold": False,
    }


async def _build_order_flow_uncached(
    *,
    days: int = 90,
    persist_auto_shipped: bool = True,
) -> Dict[str, Any]:
    today = datetime.now(timezone.utc).astimezone(ZoneInfo("America/Chicago")).date().isoformat()
    stored = order_flow_store.load_all().get("orders") or {}
    brands = BRANDS

    all_merged: List[Dict[str, Any]] = []
    errors: Dict[str, str] = {}
    seen_ids: set[str] = set()
    auto_ship_items: List[Dict[str, str]] = []

    fetched = await asyncio.gather(
        *[fetch_brand_orders(brand, days=days) for brand in brands]
    )
    for brand, (nodes, err) in zip(brands, fetched):
        if err:
            errors[brand] = err
        for node in nodes:
            merged = merge_order(brand, node, stored, today)
            if (
                persist_auto_shipped
                and merged.get("autoShippedFromShopify")
                and not merged.get("cancelledAt")
            ):
                auto_ship_items.append(
                    {
                        "brand": brand,
                        "shopifyOrderId": merged["id"],
                        "orderName": str(merged.get("orderNumber") or ""),
                    }
                )
                merged["stage"] = "shipped"
                merged["stageLabel"] = STAGE_LABELS["shipped"]
                merged["autoShippedFromShopify"] = False
            all_merged.append(merged)
            seen_ids.add(f"{brand}::{merged['id']}")

    if auto_ship_items:
        try:
            order_flow_store.bulk_upsert_stage(auto_ship_items, "shipped", actor="shopify")
        except Exception:
            pass

    # Denied decisions that dropped out of the Shopify window still appear in the queue.
    for key, record in stored.items():
        if not isinstance(record, dict):
            continue
        review = order_flow_store.get_risk_review(record)
        if not review or str(review.get("status") or "").lower() != "denied":
            continue
        brand = str(record.get("brand") or "")
        if brand not in brands:
            continue
        rid = str(record.get("shopifyOrderId") or "")
        store_key = f"{brand}::{rid}"
        if store_key in seen_ids:
            continue
        all_merged.append(_order_from_denied_record(record))

    pending: List[Dict[str, Any]] = []
    approved: List[Dict[str, Any]] = []
    denied: List[Dict[str, Any]] = []
    production: List[Dict[str, Any]] = []

    for o in all_merged:
        status = o.get("riskStatus")
        if status == "denied" or (o.get("cancelledAt") and status == "denied"):
            denied.append(o)
            continue
        if o.get("cancelledAt"):
            # Cancelled without our deny decision — skip production & pending
            continue
        if o.get("riskPendingHold"):
            pending.append(o)
            continue
        if status == "approved":
            approved.append(o)
        production.append(o)

    # Sort: open first, then 7+ day high priority, then 3+ day early warning, then deadlines
    priority = {"overdue": 0, "due_today": 1, "upcoming": 2, "ok": 3, "none": 4}

    def sort_key(o: Dict[str, Any]):
        return (
            0 if o["stage"] != "shipped" else 1,
            0 if o.get("highPriority") else 1,
            0 if o.get("earlyWarning") else 1,
            priority.get(o["deadlineState"], 9),
            o.get("expectedShipDate") or "9999-99-99",
            o.get("orderDateTime") or "",
        )

    def sort_risk(o: Dict[str, Any]):
        level_rank = {"HIGH": 0, "MEDIUM": 1, "LOW": 2, "NONE": 3}.get(str(o.get("riskLevel") or ""), 9)
        rec_rank = {"CANCEL": 0, "INVESTIGATE": 1, "ACCEPT": 2, "NONE": 3}.get(
            str(o.get("riskRecommendation") or ""), 9
        )
        return (rec_rank, level_rank, o.get("orderDateTime") or "")

    production.sort(key=sort_key)
    pending.sort(key=sort_risk)
    approved.sort(key=sort_key)
    denied.sort(
        key=lambda o: o.get("riskReview", {}).get("decidedAt") or o.get("cancelledAt") or "",
        reverse=True,
    )

    counts = {stage: 0 for stage in order_flow_store.STAGES}
    for o in production:
        counts[o["stage"]] = counts.get(o["stage"], 0) + 1

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "today": today,
        "stages": [
            {
                "id": s,
                "label": STAGE_LABELS[s],
                "count": counts.get(s, 0),
            }
            for s in order_flow_store.STAGES
        ],
        "orders": production,
        "riskQueue": {
            "pending": pending,
            "approved": approved,
            "denied": denied,
            "pendingCount": len(pending),
        },
        "errors": errors,
    }


def _filter_order_flow_payload(
    payload: Dict[str, Any],
    *,
    brand_filter: Optional[str],
    stage_filter: Optional[str],
) -> Dict[str, Any]:
    out = copy.deepcopy(payload)
    brands: Optional[Tuple[str, ...]] = None
    if brand_filter and brand_filter != "all":
        key = brand_filter.strip().lower()
        if key in {"livdon", "live-don"}:
            brands = ("live-don",)
        elif key in {"sinners", "sinners-testimony"}:
            brands = ("sinners-testimony",)
        else:
            brands = (key,)

    if brands is not None:
        brand_set = set(brands)
        out["orders"] = [o for o in out.get("orders") or [] if o.get("brand") in brand_set]
        rq = out.get("riskQueue") or {}
        for bucket in ("pending", "approved", "denied"):
            rq[bucket] = [o for o in (rq.get(bucket) or []) if o.get("brand") in brand_set]
        rq["pendingCount"] = len(rq.get("pending") or [])
        out["riskQueue"] = rq
        counts = {stage: 0 for stage in order_flow_store.STAGES}
        for o in out["orders"]:
            counts[o["stage"]] = counts.get(o["stage"], 0) + 1
        out["stages"] = [
            {"id": s, "label": STAGE_LABELS[s], "count": counts.get(s, 0)}
            for s in order_flow_store.STAGES
        ]
        # Drop errors for brands not requested
        errs = out.get("errors") or {}
        out["errors"] = {k: v for k, v in errs.items() if k in brand_set}

    if stage_filter and stage_filter != "all":
        out["orders"] = [o for o in out.get("orders") or [] if o.get("stage") == stage_filter]

    return out


async def build_order_flow(
    *,
    brand_filter: Optional[str] = None,
    stage_filter: Optional[str] = None,
    days: int = 90,
    persist_auto_shipped: bool = True,
    refresh: bool = False,
) -> Dict[str, Any]:
    days_key = max(1, min(int(days or 90), 120))
    now = time.monotonic()

    cached = _order_flow_cache.get(days_key)
    if (
        not refresh
        and cached
        and (now - cached[0]) < _ORDER_FLOW_CACHE_TTL_SEC
    ):
        payload = _filter_order_flow_payload(
            cached[1],
            brand_filter=brand_filter,
            stage_filter=stage_filter,
        )
        payload["cache"] = {
            "hit": True,
            "ageSec": round(now - cached[0], 2),
            "ttlSec": _ORDER_FLOW_CACHE_TTL_SEC,
        }
        return payload

    def _clear(t: asyncio.Task[Dict[str, Any]], key: int = days_key) -> None:
        current = _order_flow_inflight.get(key)
        if current is t:
            _order_flow_inflight.pop(key, None)

    # refresh=true always starts a new build (don't reuse a pre-write inflight).
    task = None if refresh else _order_flow_inflight.get(days_key)
    if task is None:
        task = asyncio.create_task(
            _build_order_flow_uncached(
                days=days_key,
                persist_auto_shipped=persist_auto_shipped,
            )
        )
        _order_flow_inflight[days_key] = task
        task.add_done_callback(_clear)

    try:
        full = await task
    except Exception:
        raise

    _order_flow_cache[days_key] = (time.monotonic(), full)
    payload = _filter_order_flow_payload(
        full,
        brand_filter=brand_filter,
        stage_filter=stage_filter,
    )
    payload["cache"] = {
        "hit": False,
        "ageSec": 0,
        "ttlSec": _ORDER_FLOW_CACHE_TTL_SEC,
    }
    return payload
