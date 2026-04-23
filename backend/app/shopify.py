from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import httpx

from .config import get_settings


class ShopifyGraphQLError(RuntimeError):
    """Top-level GraphQL errors or missing data."""


class ShopifyClient:
    def __init__(self) -> None:
        self._access_token: Optional[str] = None
        self._expires_at: Optional[datetime] = None

    def _urls(self) -> tuple[str, str, str]:
        s = get_settings()
        base = f"https://{s.shopify_store_domain}"
        graphql = f"{base}/admin/api/{s.shopify_api_version}/graphql.json"
        token = f"{base}/admin/oauth/access_token"
        return base, graphql, token

    async def get_access_token(self) -> str:
        now = datetime.now(timezone.utc)

        if self._access_token and self._expires_at and now < self._expires_at:
            return self._access_token

        _, _, token_url = self._urls()
        s = get_settings()
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                token_url,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "grant_type": "client_credentials",
                    "client_id": s.shopify_client_id,
                    "client_secret": s.shopify_client_secret,
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

    async def graphql(self, query: str, variables: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        token = await self.get_access_token()
        _, graphql_url, _ = self._urls()

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
        if errors:
            raise ShopifyGraphQLError(f"Shopify GraphQL errors: {errors}")

        data = payload.get("data")
        if data is None:
            raise ShopifyGraphQLError("Shopify GraphQL response had no data")

        return data

    async def run_shopifyql(self, shopifyql: str) -> Dict[str, Any]:
        """
        Run a ShopifyQL report via Admin GraphQL. Requires read_reports (and often Shopify Plus
        for some datasets). Use for analytics-aligned dashboard cards.
        """
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


shopify_client = ShopifyClient()
