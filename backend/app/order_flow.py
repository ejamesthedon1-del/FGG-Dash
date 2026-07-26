from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from . import order_flow_store
from .shopify import get_shopify_client
from .shopify_color import PRODUCT_COLOR_GRAPHQL, resolve_product_color

BRANDS = ("live-don", "sinners-testimony")

BRAND_LABELS = {
    "live-don": "LIVDON",
    "sinners-testimony": "Sinners Testimony",
}

STAGE_LABELS = {
    "needs_blanks": "Needs Blanks",
    "blanks_ordered": "Blanks Ordered",
    "in_production": "In Production",
    "ready_to_ship": "Ready to Ship",
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
          city
          provinceCode
          countryCodeV2
        }}
        currentTotalPriceSet {{
          shopMoney {{
            amount
            currencyCode
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
            # Size-only variants (Liv Don painters) use variantTitle as size
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
    """Fetch recent non-cancelled orders for a brand. Returns (nodes, error)."""
    try:
        client = get_shopify_client(brand)
    except RuntimeError as exc:
        return [], str(exc)

    since = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    query_string = f"created_at:>={since} status:any"
    cursor: Optional[str] = None
    nodes: List[Dict[str, Any]] = []

    try:
        for _ in range(10):  # hard cap pages
            data = await client.graphql(
                ORDERS_QUERY,
                {"queryString": query_string, "cursor": cursor},
            )
            block = data.get("orders") or {}
            for edge in block.get("edges") or []:
                node = edge.get("node") or {}
                if node.get("cancelledAt"):
                    continue
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
    open_order = stage != "shipped"
    # Open orders older than 7 days are high priority (red).
    high_priority = open_order and age_days > 7
    # Day 3–7: early warning before late/high priority.
    early_warning = open_order and not high_priority and age_days >= 3

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
        "autoShippedFromShopify": auto_shipped,
        "notes": record.get("notes") or "",
        "blanksReceipt": order_flow_store.get_blanks_receipt(record),
        "history": record.get("history") or [],
        "shopifyNote": node.get("note") or "",
        "tags": node.get("tags") or [],
        "total": {
            "amount": float(money.get("amount") or 0),
            "currency": money.get("currencyCode") or "USD",
        },
        "shippingAddress": node.get("shippingAddress") or {},
        "updatedAt": record.get("updatedAt"),
    }


async def build_order_flow(
    *,
    brand_filter: Optional[str] = None,
    stage_filter: Optional[str] = None,
    days: int = 90,
    persist_auto_shipped: bool = True,
) -> Dict[str, Any]:
    today = datetime.now(timezone.utc).astimezone(ZoneInfo("America/Chicago")).date().isoformat()
    stored = order_flow_store.load_all().get("orders") or {}

    brands = BRANDS
    if brand_filter and brand_filter != "all":
        key = brand_filter.strip().lower()
        if key in {"livdon", "live-don"}:
            brands = ("live-don",)
        elif key in {"sinners", "sinners-testimony"}:
            brands = ("sinners-testimony",)
        else:
            brands = (key,)

    orders: List[Dict[str, Any]] = []
    errors: Dict[str, str] = {}

    for brand in brands:
        nodes, err = await fetch_brand_orders(brand, days=days)
        if err:
            errors[brand] = err
        for node in nodes:
            merged = merge_order(brand, node, stored, today)
            if persist_auto_shipped and merged.get("autoShippedFromShopify"):
                try:
                    order_flow_store.upsert_stage(
                        brand,
                        merged["id"],
                        "shipped",
                        actor="shopify",
                        order_name=merged["orderNumber"],
                    )
                    # refresh history/notes from store
                    rec = order_flow_store.get_record(brand, merged["id"]) or {}
                    merged["history"] = rec.get("history") or merged["history"]
                    merged["updatedAt"] = rec.get("updatedAt")
                    merged["autoShippedFromShopify"] = False
                except Exception:
                    pass
            orders.append(merged)

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

    orders.sort(key=sort_key)

    counts = {stage: 0 for stage in order_flow_store.STAGES}
    for o in orders:
        counts[o["stage"]] = counts.get(o["stage"], 0) + 1

    if stage_filter and stage_filter != "all":
        orders = [o for o in orders if o["stage"] == stage_filter]

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
        "orders": orders,
        "errors": errors,
    }
