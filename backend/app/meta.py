from __future__ import annotations

from datetime import date
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlencode

import httpx

from .config import get_settings


class MetaAdsError(RuntimeError):
    """Meta Marketing API errors."""


class MetaAdsClient:
    def _creds(self, brand: str = "live-don") -> Tuple[Optional[str], Optional[str]]:
        s = get_settings()
        key = (brand or "live-don").strip().lower()
        if key in {"sinners-testimony", "sinners"}:
            return s.meta_sinners_access_token, s.meta_sinners_ad_account_id
        return s.meta_access_token, s.meta_ad_account_id

    def configured(self, brand: str = "live-don") -> bool:
        token, account_id = self._creds(brand)
        return bool(token and account_id)

    def _account_path(self, brand: str = "live-don") -> str:
        _, account_id = self._creds(brand)
        if not account_id:
            raise MetaAdsError("Meta ad account id missing")
        account_id = account_id.strip()
        if account_id.startswith("act_"):
            return account_id
        return f"act_{account_id}"

    async def spend_range(
        self,
        since: date,
        until: date,
        brand: str = "live-don",
    ) -> Dict[str, Any]:
        if not self.configured(brand):
            raise MetaAdsError("Meta ads is not configured (token / ad account missing)")

        token, _ = self._creds(brand)
        s = get_settings()
        since_str = since.isoformat()
        until_str = until.isoformat()
        params = {
            "fields": "spend,impressions,clicks,cpc,cpm,actions",
            "time_range": f'{{"since":"{since_str}","until":"{until_str}"}}',
            "level": "account",
            "access_token": token,
        }
        url = (
            f"https://graph.facebook.com/{s.meta_api_version}/"
            f"{self._account_path(brand)}/insights?{urlencode(params)}"
        )

        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.get(url)
            payload = response.json()
            if response.status_code >= 400:
                err = (payload.get("error") or {}).get("message") or response.text
                raise MetaAdsError(f"Meta HTTP {response.status_code}: {err}")

        rows = payload.get("data") or []
        if not rows:
            return {
                "since": since_str,
                "until": until_str,
                "spend": 0.0,
                "currency": "USD",
                "impressions": 0,
                "clicks": 0,
                "raw": payload,
            }

        row = rows[0]
        return {
            "since": since_str,
            "until": until_str,
            "date": until_str if since == until else f"{since_str}:{until_str}",
            "spend": float(row.get("spend") or 0),
            "currency": "USD",
            "impressions": int(row.get("impressions") or 0),
            "clicks": int(row.get("clicks") or 0),
            "cpc": float(row["cpc"]) if row.get("cpc") is not None else None,
            "cpm": float(row["cpm"]) if row.get("cpm") is not None else None,
            "raw": row,
        }

    async def daily_spend(
        self,
        day: Optional[date] = None,
        brand: str = "live-don",
    ) -> Dict[str, Any]:
        day = day or date.today()
        return await self.spend_range(day, day, brand=brand)


meta_ads_client = MetaAdsClient()
