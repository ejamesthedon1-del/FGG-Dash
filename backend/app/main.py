from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .schemas import (
    OrderFlowNotesUpdateRequest,
    OrderFlowStatusUpdateRequest,
    ProductCostsPutRequest,
    ProductCreateRequest,
    ProductRenameRequest,
    ShopifyqlRequest,
)
from .shopify import ShopifyGraphQLError, get_shopify_client
from .meta import MetaAdsError, meta_ads_client
from .slack import SlackError, slack_client
from . import order_flow_store, product_costs_store
from .order_flow import build_order_flow
from .shopify_color import PRODUCT_COLOR_GRAPHQL, product_label_with_color, resolve_product_color

app = FastAPI(title="Shopify Dashboard Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BRAND_LABELS = {
    "live-don": "Livdon",
    "sinners-testimony": "Sinners Testimony",
}


def resolve_brand(brand: str | None) -> str:
    key = (brand or "live-don").strip().lower()
    if key in {"livdon", "default", ""}:
        return "live-don"
    if key in {"sinners"}:
        return "sinners-testimony"
    return key


async def shop_timezone(brand: str = "live-don") -> ZoneInfo:
    client = get_shopify_client(brand)
    data = await client.graphql(
        """
        query ShopTimezone {
          shop {
            ianaTimezone
          }
        }
        """
    )
    tz_name = (data.get("shop") or {}).get("ianaTimezone") or "UTC"
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("UTC")


def local_date_str(dt: datetime, tz: ZoneInfo) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz).date().isoformat()


@app.get("/health")
async def health() -> dict:
    status = order_flow_store.storage_status()
    return {
        "ok": True,
        "orderFlow": {
            "backend": status["backend"],
            "durable": status["durable"],
            "recordCount": status["recordCount"],
        },
    }


@app.get("/api/product-costs")
async def get_product_costs(brand: str = "live-don") -> dict:
    """Persistent garment+labor costs per product title (shared across all users/devices)."""
    brand_key = resolve_brand(brand)
    costs = product_costs_store.load_brand(brand_key)
    return {"brand": brand_key, "costs": costs}


@app.put("/api/product-costs")
async def put_product_costs(body: ProductCostsPutRequest, brand: str = "live-don") -> dict:
    brand_key = resolve_brand(brand)
    payload = {
        title: {"garmentCost": c.garmentCost, "laborCost": c.laborCost}
        for title, c in body.costs.items()
    }
    saved = product_costs_store.save_brand(brand_key, payload)
    return {"brand": brand_key, "costs": saved}


@app.get("/api/order-flow")
async def get_order_flow(
    brand: str = "all",
    stage: str = "all",
    days: int = 90,
) -> dict:
    """Combined Livdon + Sinners orders with FGG production stages."""
    try:
        return await build_order_flow(brand_filter=brand, stage_filter=stage, days=days)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/order-flow/status")
async def post_order_flow_status(body: OrderFlowStatusUpdateRequest) -> dict:
    """Move one or many orders to a FGG production stage (batch-safe)."""
    stage = body.stage.strip()
    stage = order_flow_store.normalize_stage(stage)
    if stage not in order_flow_store.STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage: {stage}")
    if stage == "blanks_ordered":
        receipt = body.blanksReceipt or {}
        data_url = str(receipt.get("dataUrl") or "").strip()
        name = str(receipt.get("name") or "").strip()
        if not name or not data_url.startswith("data:"):
            raise HTTPException(
                status_code=400,
                detail="Blanks order receipt is required to move to Blanks Ordered",
            )
    items = []
    for o in body.orders:
        items.append(
            {
                "brand": resolve_brand(o.brand),
                "shopifyOrderId": o.shopifyOrderId,
                "orderName": o.orderName or "",
            }
        )
    try:
        updated = order_flow_store.bulk_upsert_stage(
            items,
            stage,
            actor="ops",
            blanks_receipt=body.blanksReceipt,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not save stage: {exc}") from exc
    return {"ok": True, "stage": stage, "updated": updated}


@app.get("/api/order-flow/storage")
async def get_order_flow_storage() -> dict:
    """Diagnostics for durable stage storage (Supabase vs file)."""
    status = order_flow_store.storage_status()
    cfg_ok = order_flow_store.persistence_backend() == "supabase"
    probe: dict = {"ok": False, "error": None}
    if cfg_ok:
        try:
            # Lightweight write/read probe using a dedicated diagnostic key.
            order_flow_store.upsert_stage(
                "live-don",
                "gid://shopify/Order/fgg-storage-probe",
                "needs_blanks",
                actor="probe",
                order_name="#PROBE",
            )
            probe = {"ok": True, "error": None}
        except Exception as exc:
            probe = {"ok": False, "error": str(exc)}
    return {**status, "writeProbe": probe}


@app.post("/api/order-flow/notes")
async def post_order_flow_notes(body: OrderFlowNotesUpdateRequest) -> dict:
    brand_key = resolve_brand(body.brand)
    record = order_flow_store.update_notes(brand_key, body.shopifyOrderId, body.notes)
    return {"ok": True, "record": record}


@app.post("/api/slack/test")
async def slack_test() -> dict:
    """Send a simple test message to the configured Slack webhook."""
    if not slack_client.configured():
        raise HTTPException(status_code=503, detail="SLACK_WEBHOOK_URL is not set")
    try:
        await slack_client.post_text("✅ FGG Order Alerts connected — Slack webhook is working.")
        return {"ok": True}
    except SlackError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/slack/notify-todays-orders")
async def slack_notify_todays_orders(brand: str = "live-don") -> dict:
    """Pull today's Shopify orders and post a summary to Slack for ops."""
    if not slack_client.configured():
        raise HTTPException(status_code=503, detail="SLACK_WEBHOOK_URL is not set")

    brand_key = resolve_brand(brand)
    label = BRAND_LABELS.get(brand_key, brand_key)

    try:
        client = get_shopify_client(brand_key)
        tz = await shop_timezone(brand_key)
        now_local = datetime.now(timezone.utc).astimezone(tz)
        today = now_local.date().isoformat()

        query = """
        query TodayOrders($queryString: String!) {
          orders(first: 100, sortKey: CREATED_AT, reverse: true, query: $queryString) {
            edges {
              node {
                name
                createdAt
                lineItems(first: 20) {
                  edges {
                    node {
                      title
                      name
                      quantity
                      variantTitle
                      variant {
                        selectedOptions { name value }
                      }
                      product {
                        """ + PRODUCT_COLOR_GRAPHQL + """
                      }
                    }
                  }
                }
              }
            }
          }
        }
        """
        data = await client.graphql(query, {"queryString": f"created_at:>={today}"})
        orders_out: list[dict] = []

        for edge in (data.get("orders") or {}).get("edges") or []:
            node = edge["node"]
            created_dt = datetime.fromisoformat((node.get("createdAt") or "").replace("Z", "+00:00"))
            if local_date_str(created_dt, tz) < today:
                continue
            items = []
            for li in (node.get("lineItems") or {}).get("edges") or []:
                item = li["node"]
                title = (item.get("title") or item.get("name") or "Item").strip()
                size = (item.get("variantTitle") or "").strip()
                # variantTitle is often "Default Title" for one-size products
                if size.lower() in {"", "default title"}:
                    # Fallback: parse "PRODUCT - Size" from name
                    full_name = (item.get("name") or "").strip()
                    if " - " in full_name:
                        maybe_size = full_name.rsplit(" - ", 1)[-1].strip()
                        if maybe_size and maybe_size.lower() != title.lower():
                            size = maybe_size
                        else:
                            size = ""
                    else:
                        size = ""
                color = resolve_product_color(
                    item.get("product"),
                    selected_options=((item.get("variant") or {}).get("selectedOptions")) or [],
                    variant_title=item.get("variantTitle"),
                )
                items.append(
                    {
                        "title": product_label_with_color(title, color),
                        "color": color or "",
                        "size": size,
                        "quantity": int(item.get("quantity") or 0),
                    }
                )
            orders_out.append(
                {
                    "name": node.get("name"),
                    "items": items,
                }
            )

        payload = slack_client.format_orders_message(
            brand=label,
            date_label=today,
            orders=orders_out,
        )
        await slack_client.post_payload(payload)
        return {
            "ok": True,
            "brand": brand_key,
            "orderCount": len(orders_out),
            "date": today,
            "orders": orders_out,
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ShopifyGraphQLError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except SlackError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/meta/ads-spend-today")
async def get_meta_ads_spend_today(brand: str = "live-don") -> dict:
    """Meta ads spend for today. Pass ?brand=live-don or ?brand=sinners-testimony."""
    brand_key = resolve_brand(brand)
    if not meta_ads_client.configured(brand_key):
        raise HTTPException(
            status_code=503,
            detail="Meta ads not configured for this brand (token / ad account missing).",
        )
    try:
        # Prefer Shopify shop timezone so “today” matches Brand Hub sales day.
        try:
            tz = await shop_timezone(brand_key)
            day = datetime.now(timezone.utc).astimezone(tz).date()
        except Exception:
            day = datetime.now(timezone.utc).date()
        return await meta_ads_client.daily_spend(day, brand=brand_key)
    except MetaAdsError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Meta HTTP error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/shopify/daily-sales")
async def get_daily_sales() -> dict:
    today = datetime.now(timezone.utc).date().isoformat()

    query = """
    query DailySales($queryString: String!) {
      orders(first: 100, sortKey: CREATED_AT, reverse: true, query: $queryString) {
        edges {
          node {
            id
            name
            createdAt
            displayFinancialStatus
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
    """

    query_string = f"created_at:>={today}"

    try:
        data = await get_shopify_client("live-don").graphql(query, {"queryString": query_string})
        orders = data.get("orders", {}).get("edges") or []

        total_sales = 0.0
        currency = "USD"
        order_count = 0
        rows = []

        for edge in orders:
            node = edge["node"]
            price = node.get("currentTotalPriceSet") or {}
            shop = price.get("shopMoney") or {}
            amount = float(shop.get("amount") or 0)
            currency = shop.get("currencyCode") or currency
            total_sales += amount
            order_count += 1
            rows.append(
                {
                    "id": node["id"],
                    "name": node["name"],
                    "createdAt": node["createdAt"],
                    "financialStatus": node.get("displayFinancialStatus"),
                    "amount": amount,
                    "currency": currency,
                }
            )

        return {
            "date": today,
            "currency": currency,
            "dailySales": round(total_sales, 2),
            "orderCount": order_count,
            "orders": rows,
        }
    except ShopifyGraphQLError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Shopify HTTP error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/shopify/brand-kpis")
async def get_brand_kpis(
    brand: str = "live-don",
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> dict:
    """Store KPIs for a date range.

    Default (no start/end): today + month-to-date (Brand Hub compatible).
    With start/end (YYYY-MM-DD, shop timezone): period totals for that inclusive range.
    """
    brand_key = resolve_brand(brand)

    def parse_ymd(value: Optional[str], label: str) -> Optional[date]:
        if value is None or not str(value).strip():
            return None
        try:
            return date.fromisoformat(str(value).strip())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid {label} date: {value}") from exc

    try:
        client = get_shopify_client(brand_key)
        tz = await shop_timezone(brand_key)
        now_local = datetime.now(timezone.utc).astimezone(tz)
        today_d = now_local.date()
        month_start_d = today_d.replace(day=1)
        today = today_d.isoformat()
        month_start = month_start_d.isoformat()

        range_start = parse_ymd(start, "start")
        range_end = parse_ymd(end, "end")
        range_mode = range_start is not None or range_end is not None

        if range_mode:
            period_start_d = range_start or month_start_d
            period_end_d = range_end or today_d
            if period_end_d < period_start_d:
                raise HTTPException(status_code=400, detail="end must be on or after start")
            if (period_end_d - period_start_d).days > 93:
                raise HTTPException(status_code=400, detail="Date range cannot exceed 93 days")
            if period_end_d > today_d:
                period_end_d = today_d
            fetch_start_d = period_start_d
        else:
            period_start_d = month_start_d
            period_end_d = today_d
            fetch_start_d = month_start_d

        query = """
        query BrandKpiOrders($queryString: String!, $cursor: String) {
          orders(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true, query: $queryString) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                createdAt
                currentTotalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                totalShippingPriceSet {
                  shopMoney {
                    amount
                  }
                }
                name
                lineItems(first: 50) {
                  edges {
                    node {
                      name
                      title
                      quantity
                      variantTitle
                      variant {
                        selectedOptions { name value }
                      }
                      product {
                        """ + PRODUCT_COLOR_GRAPHQL + """
                      }
                    }
                  }
                }
                transactions(first: 20) {
                  status
                  kind
                  fees {
                    amount {
                      amount
                      currencyCode
                    }
                    type
                  }
                }
              }
            }
          }
        }
        """

        # Shopify order search dates are evaluated in shop timezone.
        query_string = f"created_at:>={fetch_start_d.isoformat()}"

        currency = "USD"
        daily_sales = 0.0
        month_sales = 0.0
        period_sales = 0.0
        daily_orders = 0
        month_orders = 0
        period_orders = 0
        daily_fees = 0.0
        month_fees = 0.0
        period_fees = 0.0
        daily_shipping = 0.0
        month_shipping = 0.0
        period_shipping = 0.0
        units_by_product: dict[str, int] = {}
        daily_units_by_product: dict[str, int] = {}
        period_units_by_product: dict[str, int] = {}
        daily_order_shipping: list[dict] = []

        cursor = None
        pages = 0
        while pages < 30:
            variables: dict = {"queryString": query_string}
            if cursor:
                variables["cursor"] = cursor

            data = await client.graphql(query, variables)
            block = data.get("orders") or {}
            edges = block.get("edges") or []
            page_info = block.get("pageInfo") or {}

            stop_paging = False
            for edge in edges:
                node = edge["node"]
                created_raw = node.get("createdAt") or ""
                created_dt = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
                created_local = local_date_str(created_dt, tz)
                created_d = date.fromisoformat(created_local)

                # Orders are reverse-chronological; once we pass fetch_start we can stop.
                if created_d < fetch_start_d:
                    stop_paging = True
                    break

                shop = ((node.get("currentTotalPriceSet") or {}).get("shopMoney")) or {}
                amount = float(shop.get("amount") or 0)
                currency = shop.get("currencyCode") or currency

                ship = ((node.get("totalShippingPriceSet") or {}).get("shopMoney")) or {}
                shipping_amount = float(ship.get("amount") or 0)

                order_fees = 0.0
                for txn in node.get("transactions") or []:
                    if (txn.get("status") or "").upper() != "SUCCESS":
                        continue
                    for fee in txn.get("fees") or []:
                        fee_amt = float(((fee.get("amount") or {}).get("amount")) or 0)
                        order_fees += fee_amt

                in_month = created_d >= month_start_d and created_d <= today_d
                is_today = created_d == today_d
                in_period = period_start_d <= created_d <= period_end_d

                if in_month:
                    month_sales += amount
                    month_orders += 1
                    month_fees += order_fees
                    month_shipping += shipping_amount

                if is_today:
                    daily_sales += amount
                    daily_orders += 1
                    daily_fees += order_fees
                    daily_shipping += shipping_amount
                    daily_order_shipping.append(
                        {
                            "name": node.get("name") or "",
                            "shipping": round(shipping_amount, 2),
                            "orderTotal": round(amount, 2),
                        }
                    )

                if in_period:
                    period_sales += amount
                    period_orders += 1
                    period_fees += order_fees
                    period_shipping += shipping_amount

                for li in (node.get("lineItems") or {}).get("edges") or []:
                    item = li["node"]
                    title = (item.get("title") or item.get("name") or "Unknown").strip()
                    color = resolve_product_color(
                        item.get("product"),
                        selected_options=((item.get("variant") or {}).get("selectedOptions")) or [],
                        variant_title=item.get("variantTitle"),
                    )
                    label = product_label_with_color(title, color)
                    qty = int(item.get("quantity") or 0)
                    if label and qty:
                        if in_month:
                            units_by_product[label] = units_by_product.get(label, 0) + qty
                        if is_today:
                            daily_units_by_product[label] = (
                                daily_units_by_product.get(label, 0) + qty
                            )
                        if in_period:
                            period_units_by_product[label] = (
                                period_units_by_product.get(label, 0) + qty
                            )

            pages += 1
            if stop_paging or not page_info.get("hasNextPage"):
                break
            cursor = page_info.get("endCursor")
            if not cursor:
                break

        # When range mode asks for a non-MTD window, month/daily still reflect
        # live shop today/MTD only if we fetched from month_start. For ranges
        # that start before month_start we already fetch from period_start.
        if range_mode and fetch_start_d < month_start_d:
            # Recompute month/daily from the same pass is already done when
            # orders fall in those windows; no extra work needed.
            pass

        top_name = None
        top_units = 0
        top_source = period_units_by_product if range_mode else units_by_product
        for name, units in top_source.items():
            if units > top_units:
                top_name = name
                top_units = units

        daily_items = [
            {"name": name, "units": units}
            for name, units in sorted(
                daily_units_by_product.items(), key=lambda kv: (-kv[1], kv[0])
            )
        ]
        month_items = [
            {"name": name, "units": units}
            for name, units in sorted(
                units_by_product.items(), key=lambda kv: (-kv[1], kv[0])
            )
        ]
        period_items = [
            {"name": name, "units": units}
            for name, units in sorted(
                period_units_by_product.items(), key=lambda kv: (-kv[1], kv[0])
            )
        ]
        daily_item_units = sum(daily_units_by_product.values())
        month_item_units = sum(units_by_product.values())
        period_item_units = sum(period_units_by_product.values())

        ads_spend_today = None
        ads_spend_month = None
        ads_spend_period = None
        ads_error = None
        if meta_ads_client.configured(brand_key):
            try:
                ads_today = await meta_ads_client.daily_spend(
                    today_d, brand=brand_key
                )
                ads_spend_today = {
                    "spend": round(float(ads_today["spend"]), 2),
                    "currency": ads_today.get("currency") or "USD",
                    "impressions": ads_today.get("impressions") or 0,
                    "clicks": ads_today.get("clicks") or 0,
                    "date": ads_today.get("date"),
                }
                ads_month = await meta_ads_client.spend_range(
                    month_start_d,
                    today_d,
                    brand=brand_key,
                )
                ads_spend_month = {
                    "spend": round(float(ads_month["spend"]), 2),
                    "currency": ads_month.get("currency") or "USD",
                    "impressions": ads_month.get("impressions") or 0,
                    "clicks": ads_month.get("clicks") or 0,
                    "since": ads_month.get("since"),
                    "until": ads_month.get("until"),
                }
                ads_period = await meta_ads_client.spend_range(
                    period_start_d,
                    period_end_d,
                    brand=brand_key,
                )
                ads_spend_period = {
                    "spend": round(float(ads_period["spend"]), 2),
                    "currency": ads_period.get("currency") or "USD",
                    "impressions": ads_period.get("impressions") or 0,
                    "clicks": ads_period.get("clicks") or 0,
                    "since": ads_period.get("since"),
                    "until": ads_period.get("until"),
                }
            except MetaAdsError as exc:
                ads_error = str(exc)

        return {
            "brand": brand_key,
            "date": today,
            "monthStart": month_start,
            "periodStart": period_start_d.isoformat(),
            "periodEnd": period_end_d.isoformat(),
            "timezone": str(tz),
            "currency": currency,
            "dailySales": round(daily_sales, 2),
            "dailyOrderCount": daily_orders,
            "monthSales": round(month_sales, 2),
            "monthOrderCount": month_orders,
            "periodSales": round(period_sales, 2),
            "periodOrderCount": period_orders,
            "dailyFees": round(daily_fees, 2),
            "monthFees": round(month_fees, 2),
            "periodFees": round(period_fees, 2),
            "dailyShipping": round(daily_shipping, 2),
            "monthShipping": round(month_shipping, 2),
            "periodShipping": round(period_shipping, 2),
            "dailyOrderShipping": daily_order_shipping,
            "dailyItems": daily_items,
            "dailyItemUnits": daily_item_units,
            "monthItems": month_items,
            "monthItemUnits": month_item_units,
            "periodItems": period_items,
            "periodItemUnits": period_item_units,
            "topProduct": (
                {"name": top_name, "units": top_units} if top_name else None
            ),
            "adsSpendToday": ads_spend_today,
            "adsSpendMonth": ads_spend_month,
            "adsSpendPeriod": ads_spend_period,
            "adsError": ads_error,
        }
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ShopifyGraphQLError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Shopify HTTP error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/shopify/payments-balance")
async def get_payments_balance(brand: str = "live-don") -> dict:
    """Current Shopify Payments account balance for a brand (CEO dashboard).

    Uses shopifyPaymentsAccount.balance — current balances in all currencies —
    not payouts (bank transfers). See:
    https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyPaymentsAccount
    """
    brand_key = resolve_brand(brand)
    try:
        client = get_shopify_client(brand_key)
        data = await client.graphql(
            """
            query ShopifyPaymentsBalance {
              shopifyPaymentsAccount {
                activated
                defaultCurrency
                balance {
                  amount
                  currencyCode
                }
              }
            }
            """
        )
        account = data.get("shopifyPaymentsAccount")
        if not account:
            return {
                "brand": brand_key,
                "configured": False,
                "activated": False,
                "balances": [],
                "totalUsd": 0,
                "primaryAmount": 0,
                "primaryCurrency": "USD",
                "error": "Shopify Payments account not available for this store",
            }

        balances = []
        total_usd = 0.0
        for row in account.get("balance") or []:
            amount = float(row.get("amount") or 0)
            currency = row.get("currencyCode") or "USD"
            balances.append({"amount": round(amount, 2), "currency": currency})
            if currency == "USD":
                total_usd += amount

        default_currency = account.get("defaultCurrency") or "USD"
        primary = next(
            (b for b in balances if b["currency"] == default_currency),
            balances[0] if balances else {"amount": 0.0, "currency": default_currency},
        )

        return {
            "brand": brand_key,
            "configured": True,
            "activated": bool(account.get("activated")),
            "balances": balances,
            "totalUsd": round(total_usd, 2),
            "primaryAmount": primary["amount"],
            "primaryCurrency": primary["currency"],
            "error": None,
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ShopifyGraphQLError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Shopify HTTP error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/shopify/products")
async def get_products(brand: str = "live-don") -> dict:
    brand_key = resolve_brand(brand)
    try:
        client = get_shopify_client(brand_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    query = """
    query ProductsList {
      products(first: 50, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            handle
            status
            totalInventory
            updatedAt
            """ + PRODUCT_COLOR_GRAPHQL + """
          }
        }
      }
    }
    """

    try:
        data = await client.graphql(query)
        products = []
        for edge in data.get("products", {}).get("edges") or []:
            node = edge["node"]
            color = resolve_product_color(node)
            products.append(
                {
                    "id": node.get("id"),
                    "title": product_label_with_color(node.get("title") or "", color),
                    "baseTitle": node.get("title"),
                    "color": color,
                    "handle": node.get("handle"),
                    "status": node.get("status"),
                    "totalInventory": node.get("totalInventory"),
                    "updatedAt": node.get("updatedAt"),
                }
            )
        return {"products": products}
    except ShopifyGraphQLError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Shopify HTTP error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/shopify/products")
async def create_product(payload: ProductCreateRequest) -> dict:
    mutation = """
    mutation CreateProduct($product: ProductCreateInput!) {
      productCreate(product: $product) {
        product {
          id
          title
          handle
          status
        }
        userErrors {
          field
          message
        }
      }
    }
    """

    product_input: dict = {
        "title": payload.title,
        "status": payload.status,
    }

    if payload.description_html:
        product_input["descriptionHtml"] = payload.description_html
    if payload.vendor:
        product_input["vendor"] = payload.vendor
    if payload.product_type:
        product_input["productType"] = payload.product_type
    if payload.tags:
        product_input["tags"] = payload.tags

    try:
        data = await get_shopify_client("live-don").graphql(mutation, {"product": product_input})
        result = data.get("productCreate") or {}
        errors = result.get("userErrors") or []
        if errors:
            raise HTTPException(status_code=400, detail=errors)

        return {"product": result.get("product")}
    except HTTPException:
        raise
    except ShopifyGraphQLError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Shopify HTTP error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.patch("/api/shopify/products/rename")
async def rename_product(payload: ProductRenameRequest) -> dict:
    mutation = """
    mutation RenameProduct($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product {
          id
          title
          handle
          updatedAt
        }
        userErrors {
          field
          message
        }
      }
    }
    """

    try:
        data = await get_shopify_client("live-don").graphql(
            mutation,
            {"product": {"id": payload.product_id, "title": payload.new_title}},
        )
        result = data.get("productUpdate") or {}
        errors = result.get("userErrors") or []
        if errors:
            raise HTTPException(status_code=400, detail=errors)

        return {"product": result.get("product")}
    except HTTPException:
        raise
    except ShopifyGraphQLError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Shopify HTTP error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/shopify/analytics/shopifyql")
async def analytics_shopifyql(body: ShopifyqlRequest) -> dict:
    """
    Run ShopifyQL (requires read_reports where applicable). Example body:
    {"query": "FROM sales SHOW total_sales, orders SINCE today"}
    """
    try:
        block = await get_shopify_client("live-don").run_shopifyql(body.query)
        return {
            "tableData": block.get("tableData"),
            "parseErrors": block.get("parseErrors") or [],
        }
    except ShopifyGraphQLError as exc:
        msg = str(exc)
        code = 403 if "Access denied" in msg or "access" in msg.lower() else 502
        raise HTTPException(status_code=code, detail=msg) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Shopify HTTP error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/shopify/analytics/daily-sales-shopifyql")
async def analytics_daily_sales_default() -> dict:
    """Default ShopifyQL aligned with Shopify Analytics-style totals (when scope/store allows)."""
    default_ql = "FROM sales SHOW total_sales, orders SINCE today"
    try:
        block = await get_shopify_client("live-don").run_shopifyql(default_ql)
        return {
            "query": default_ql,
            "tableData": block.get("tableData"),
            "parseErrors": block.get("parseErrors") or [],
        }
    except ShopifyGraphQLError as exc:
        msg = str(exc)
        code = 403 if "Access denied" in msg or "access" in msg.lower() else 502
        raise HTTPException(status_code=code, detail=msg) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Shopify HTTP error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
