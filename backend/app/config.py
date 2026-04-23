from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    shopify_store_domain: str
    shopify_client_id: str
    shopify_client_secret: str
    shopify_api_version: str = "2026-04"
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("shopify_store_domain")
    @classmethod
    def strip_domain(cls, v: str) -> str:
        v = v.strip()
        if v.startswith("https://"):
            v = v[len("https://") :]
        if v.endswith("/"):
            v = v[:-1]
        return v

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
