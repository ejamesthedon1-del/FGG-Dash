from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .schemas import ProductCreateRequest, ProductRenameRequest, ShopifyqlRequest
from .shopify import ShopifyGraphQLError, shopify_client

app = FastAPI(title="Shopify Dashboard Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


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
        data = await shopify_client.graphql(query, {"queryString": query_string})
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


@app.get("/api/shopify/orders")
async def get_orders() -> dict:
    query = """
    query RecentOrders {
      orders(first: 25, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            email
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            lineItems(first: 10) {
              edges {
                node {
                  name
                  quantity
                }
              }
            }
          }
        }
      }
    }
    """

    try:
        data = await shopify_client.graphql(query)
        orders_out = []

        for edge in data.get("orders", {}).get("edges") or []:
            node = edge["node"]
            line_edges = (node.get("lineItems") or {}).get("edges") or []
            orders_out.append(
                {
                    "id": node["id"],
                    "name": node["name"],
                    "createdAt": node["createdAt"],
                    "email": node.get("email"),
                    "financialStatus": node.get("displayFinancialStatus"),
                    "fulfillmentStatus": node.get("displayFulfillmentStatus"),
                    "total": (node.get("currentTotalPriceSet") or {}).get("shopMoney"),
                    "items": [
                        {"name": li["node"]["name"], "quantity": li["node"]["quantity"]}
                        for li in line_edges
                    ],
                }
            )

        return {"orders": orders_out}
    except ShopifyGraphQLError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Shopify HTTP error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/shopify/products")
async def get_products() -> dict:
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
          }
        }
      }
    }
    """

    try:
        data = await shopify_client.graphql(query)
        products = [edge["node"] for edge in data.get("products", {}).get("edges") or []]
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
        data = await shopify_client.graphql(mutation, {"product": product_input})
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
        data = await shopify_client.graphql(
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
        block = await shopify_client.run_shopifyql(body.query)
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
        block = await shopify_client.run_shopifyql(default_ql)
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
