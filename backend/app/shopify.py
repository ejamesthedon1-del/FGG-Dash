from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import httpx

from .config import get_settings


class ShopifyGraphQLError(RuntimeError):
    """Top-level GraphQL errors or missing data."""


def _graphql_errors_are_throttled(errors: Any) -> bool:
    if not isinstance(errors, list):
        return False
    for err in errors:
        if not isinstance(err, dict):
            continue
        code = ((err.get("extensions") or {}) if isinstance(err.get("extensions"), dict) else {}).get(
            "code"
        )
        if str(code).upper() == "THROTTLED":
            return True
        if "throttl" in str(err.get("message") or "").lower():
            return True
    return False


class ShopifyClient:
    def __init__(self, store_domain: str, client_id: str, client_secret: str, api_version: str) -> None:
        self.store_domain = store_domain.strip().removeprefix("https://").rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.api_version = api_version
        self._access_token: Optional[str] = None
        self._expires_at: Optional[datetime] = None

    def _urls(self) -> tuple[str, str, str]:
        base = f"https://{self.store_domain}"
        graphql = f"{base}/admin/api/{self.api_version}/graphql.json"
        token = f"{base}/admin/oauth/access_token"
        return base, graphql, token

    async def get_access_token(self) -> str:
        now = datetime.now(timezone.utc)

        if self._access_token and self._expires_at and now < self._expires_at:
            return self._access_token

        _, _, token_url = self._urls()
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                token_url,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
            )
            response.raise_for_status()
            payload = response.json()

        token = payload.get("access_token")
        expires_in = int(payload.get("expires_in", 86399))

        if not token:
            raise RuntimeError("Shopify token response did not include access_token")

        self._access_token = token
        self._expires_at = now + timedelta(seconds=max(expires_in - 300, 60))
        return token

    async def graphql(
        self,
        query: str,
        variables: Optional[Dict[str, Any]] = None,
        *,
        api_version: Optional[str] = None,
    ) -> Dict[str, Any]:
        token = await self.get_access_token()
        version = (api_version or self.api_version).strip()
        graphql_url = f"https://{self.store_domain}/admin/api/{version}/graphql.json"

        last_errors: Any = None
        for attempt in range(5):
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    graphql_url,
                    headers={
                        "Content-Type": "application/json",
                        "X-Shopify-Access-Token": token,
                    },
                    json={"query": query, "variables": variables or {}},
                )
                response.raise_for_status()
                payload = response.json()

            errors = payload.get("errors")
            if errors and _graphql_errors_are_throttled(errors):
                last_errors = errors
                # Shopify restore rate is ~50 points/sec; back off and retry.
                await asyncio.sleep(1.2 * (attempt + 1))
                continue
            if errors:
                raise ShopifyGraphQLError(f"Shopify GraphQL errors: {errors}")

            data = payload.get("data")
            if data is None:
                raise ShopifyGraphQLError("Shopify GraphQL response had no data")
            return data

        raise ShopifyGraphQLError(f"Shopify GraphQL errors: {last_errors}")

    async def run_shopifyql(self, shopifyql: str) -> Dict[str, Any]:
        gql = """
        query RunShopifyql($shopifyQl: String!) {
          shopifyqlQuery(query: $shopifyQl) {
            tableData {
              columns {
                name
                dataType
                displayName
              }
              rows
            }
            parseErrors
          }
        }
        """
        data = await self.graphql(gql, {"shopifyQl": shopifyql})
        block = data.get("shopifyqlQuery")
        if not block:
            raise ShopifyGraphQLError("shopifyqlQuery missing from response")
        parse_errors = block.get("parseErrors") or []
        if parse_errors:
            raise ShopifyGraphQLError(f"ShopifyQL parse errors: {parse_errors}")
        return block


_BRAND_CLIENTS: Dict[str, ShopifyClient] = {}


def _normalize_domain(v: str) -> str:
    v = v.strip()
    if v.startswith("https://"):
        v = v[len("https://") :]
    return v.rstrip("/")


def get_shopify_client(brand: str = "live-don") -> ShopifyClient:
    """Return a Shopify Admin client for the given Brands slug."""
    key = (brand or "live-don").strip().lower()
    if key in _BRAND_CLIENTS:
        return _BRAND_CLIENTS[key]

    s = get_settings()
    if key in {"live-don", "livdon", "default", ""}:
        client = ShopifyClient(
            store_domain=s.shopify_store_domain,
            client_id=s.shopify_client_id,
            client_secret=s.shopify_client_secret,
            api_version=s.shopify_api_version,
        )
    elif key in {"sinners-testimony", "sinners"}:
        if not (
            s.shopify_sinners_store_domain
            and s.shopify_sinners_client_id
            and s.shopify_sinners_client_secret
        ):
            raise RuntimeError(
                "Sinners Testimony Shopify is not configured "
                "(SHOPIFY_SINNERS_STORE_DOMAIN / CLIENT_ID / CLIENT_SECRET)"
            )
        client = ShopifyClient(
            store_domain=_normalize_domain(s.shopify_sinners_store_domain),
            client_id=s.shopify_sinners_client_id,
            client_secret=s.shopify_sinners_client_secret,
            api_version=s.shopify_api_version,
        )
    else:
        raise RuntimeError(f"Unknown Shopify brand key: {brand}")

    _BRAND_CLIENTS[key] = client
    return client


# Backward-compatible default (Livdon)
shopify_client = None  # set after settings load via get_shopify_client


def default_shopify_client() -> ShopifyClient:
    return get_shopify_client("live-don")


ORDER_CANCEL_MUTATION = """
mutation OrderCancel(
  $orderId: ID!
  $notifyCustomer: Boolean
  $refundMethod: OrderCancelRefundMethodInput!
  $restock: Boolean!
  $reason: OrderCancelReason!
  $staffNote: String
) {
  orderCancel(
    orderId: $orderId
    notifyCustomer: $notifyCustomer
    refundMethod: $refundMethod
    restock: $restock
    reason: $reason
    staffNote: $staffNote
  ) {
    job {
      id
      done
    }
    orderCancelUserErrors {
      field
      message
      code
    }
    userErrors {
      field
      message
    }
  }
}
"""


async def cancel_order_for_fraud(
    brand: str,
    shopify_order_id: str,
    *,
    staff_note: str = "",
) -> Dict[str, Any]:
    """
    Cancel an order in Shopify as fraud.

    Requires the Shopify app `write_orders` scope. Returns the mutation payload.
    Raises ShopifyGraphQLError / RuntimeError on failure.
    """
    client = get_shopify_client(brand)
    data = await client.graphql(
        ORDER_CANCEL_MUTATION,
        {
            "orderId": shopify_order_id,
            "notifyCustomer": False,
            "refundMethod": {"originalPaymentMethodsRefund": True},
            "restock": True,
            "reason": "FRAUD",
            "staffNote": (staff_note or "Denied in FGG Risk review")[:255],
        },
    )
    block = data.get("orderCancel") or {}
    user_errors = list(block.get("orderCancelUserErrors") or []) + list(block.get("userErrors") or [])
    if user_errors:
        messages = "; ".join(
            str(e.get("message") or e) for e in user_errors if isinstance(e, dict) or e
        )
        raise ShopifyGraphQLError(messages or "Shopify orderCancel failed")
    return block
