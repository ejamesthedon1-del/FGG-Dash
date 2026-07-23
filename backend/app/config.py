from functools import lru_cache
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    shopify_store_domain: str
    shopify_client_id: str
    shopify_client_secret: str
    shopify_api_version: str = "2026-04"
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    # Optional Meta Marketing API (Facebook Ads) — Liv Don by default
    meta_access_token: Optional[str] = None
    meta_ad_account_id: Optional[str] = None
    meta_api_version: str = "v22.0"

    # Optional Meta for Sinners Testimony
    meta_sinners_access_token: Optional[str] = None
    meta_sinners_ad_account_id: Optional[str] = None

    # Optional Slack Incoming Webhook (ops order alerts)
    slack_webhook_url: Optional[str] = None

    # Optional second store: Sinners Testimony
    shopify_sinners_store_domain: Optional[str] = None
    shopify_sinners_client_id: Optional[str] = None
    shopify_sinners_client_secret: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("shopify_store_domain")
    @classmethod
    def strip_primary_domain(cls, v: str) -> str:
        v = v.strip()
        if v.startswith("https://"):
            v = v[len("https://") :]
        if v.endswith("/"):
            v = v[:-1]
        return v

    @field_validator("shopify_sinners_store_domain")
    @classmethod
    def strip_sinners_domain(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if v.startswith("https://"):
            v = v[len("https://") :]
        if v.endswith("/"):
            v = v[:-1]
        return v

    @field_validator("meta_ad_account_id", "meta_sinners_ad_account_id")
    @classmethod
    def normalize_ad_account(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
