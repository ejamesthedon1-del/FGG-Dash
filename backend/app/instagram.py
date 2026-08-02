"""Instagram organic publishing via Meta Graph API (Business/Creator accounts)."""

from __future__ import annotations

import asyncio
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from . import instagram_store
from .config import get_settings

VALID_BRANDS = {"live-don", "sinners-testimony"}

# Content publishing for IG Business accounts linked to a Facebook Page.
IG_SCOPES = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
    "business_management",
]


def normalize_brand(brand: str) -> str:
    key = (brand or "").strip().lower()
    if key in ("livdon", "live-don", "livedon"):
        return "live-don"
    if key in ("sinners", "sinners-testimony"):
        return "sinners-testimony"
    return key


def instagram_configured() -> bool:
    s = get_settings()
    return bool((s.meta_app_id or "").strip() and (s.meta_app_secret or "").strip())


def redirect_uri() -> str:
    s = get_settings()
    return (
        s.meta_instagram_redirect_uri
        or "http://localhost:8000/api/instagram/callback"
    ).strip()


def frontend_origin() -> str:
    s = get_settings()
    raw = (s.frontend_origin or "").strip()
    if raw:
        return raw.rstrip("/")
    origins = s.cors_origin_list()
    return (origins[0] if origins else "http://localhost:5173").rstrip("/")


def api_version() -> str:
    s = get_settings()
    return (s.meta_api_version or "v22.0").strip()


def build_authorize_url(brand: str) -> str:
    if not instagram_configured():
        raise HTTPException(
            status_code=503,
            detail="Instagram OAuth is not configured (META_APP_ID / META_APP_SECRET).",
        )
    brand_key = normalize_brand(brand)
    if brand_key not in VALID_BRANDS:
        raise HTTPException(status_code=400, detail="Unknown brand")
    s = get_settings()
    state = secrets.token_urlsafe(24)
    instagram_store.save_oauth_state(state, brand_key)
    params = {
        "client_id": s.meta_app_id,
        "redirect_uri": redirect_uri(),
        "state": state,
        "response_type": "code",
        "scope": ",".join(IG_SCOPES),
    }
    return f"https://www.facebook.com/{api_version()}/dialog/oauth?{urlencode(params)}"


async def exchange_code(code: str) -> Dict[str, Any]:
    s = get_settings()
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(
            f"https://graph.facebook.com/{api_version()}/oauth/access_token",
            params={
                "client_id": s.meta_app_id,
                "client_secret": s.meta_app_secret,
                "redirect_uri": redirect_uri(),
                "code": code,
            },
        )
    if res.status_code >= 400:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {res.text}")
    data = res.json()
    short = data.get("access_token")
    if not short:
        raise HTTPException(status_code=400, detail="No access_token in OAuth response")

    # Exchange for long-lived user token
    async with httpx.AsyncClient(timeout=30.0) as client:
        long_res = await client.get(
            f"https://graph.facebook.com/{api_version()}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": s.meta_app_id,
                "client_secret": s.meta_app_secret,
                "fb_exchange_token": short,
            },
        )
    user_token = short
    expires_at = None
    if long_res.status_code < 400:
        long_data = long_res.json()
        user_token = long_data.get("access_token") or short
        expires_in = int(long_data.get("expires_in") or 0)
        if expires_in > 0:
            expires_at = (
                datetime.now(timezone.utc) + timedelta(seconds=max(60, expires_in - 60))
            ).isoformat()

    page = await _pick_instagram_page(user_token)
    return {
        "userAccessToken": user_token,
        "pageAccessToken": page["pageAccessToken"],
        "pageId": page["pageId"],
        "pageName": page.get("pageName"),
        "igUserId": page["igUserId"],
        "username": page.get("username"),
        "expiresAt": expires_at,
        "connectedAt": datetime.now(timezone.utc).isoformat(),
    }


async def _pick_instagram_page(user_token: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        pages_res = await client.get(
            f"https://graph.facebook.com/{api_version()}/me/accounts",
            params={
                "fields": "id,name,access_token,instagram_business_account{id,username}",
                "access_token": user_token,
            },
        )
    if pages_res.status_code >= 400:
        raise HTTPException(
            status_code=400,
            detail=f"Could not list Facebook Pages: {pages_res.text}",
        )
    pages = (pages_res.json() or {}).get("data") or []
    for page in pages:
        ig = page.get("instagram_business_account") or {}
        ig_id = ig.get("id")
        if not ig_id:
            continue
        token = page.get("access_token")
        if not token:
            continue
        return {
            "pageId": page.get("id"),
            "pageName": page.get("name"),
            "pageAccessToken": token,
            "igUserId": ig_id,
            "username": ig.get("username"),
        }
    raise HTTPException(
        status_code=400,
        detail=(
            "No Facebook Page with a linked Instagram Business account was found. "
            "Convert the IG account to Business/Creator and link it to a Page."
        ),
    )


async def complete_oauth(brand: str, code: str) -> Dict[str, Any]:
    brand_key = normalize_brand(brand)
    row = await exchange_code(code)
    instagram_store.set_brand(brand_key, row)
    return row


def connection_status(brand: str) -> Dict[str, Any]:
    brand_key = normalize_brand(brand)
    row = instagram_store.get_brand(brand_key) if brand_key in VALID_BRANDS else None
    connected = bool(row and row.get("pageAccessToken") and row.get("igUserId"))
    return {
        "configured": instagram_configured(),
        "connected": connected,
        "brand": brand_key,
        "username": (row or {}).get("username"),
        "igUserId": (row or {}).get("igUserId"),
        "pageId": (row or {}).get("pageId"),
        "redirectUri": redirect_uri(),
        "error": None,
    }


def disconnect(brand: str) -> None:
    brand_key = normalize_brand(brand)
    if brand_key not in VALID_BRANDS:
        raise HTTPException(status_code=400, detail="Unknown brand")
    instagram_store.clear_brand(brand_key)


async def _wait_media_ready(
    client: httpx.AsyncClient,
    creation_id: str,
    token: str,
    *,
    label: str = "Media",
) -> None:
    for _ in range(18):
        status_res = await client.get(
            f"https://graph.facebook.com/{api_version()}/{creation_id}",
            params={
                "fields": "status_code",
                "access_token": token,
            },
        )
        if status_res.status_code < 400:
            code = (status_res.json() or {}).get("status_code")
            if code == "FINISHED":
                return
            if code == "ERROR":
                raise HTTPException(
                    status_code=400,
                    detail=f"{label} container failed: {status_res.text}",
                )
        await asyncio.sleep(2)
    # Some image containers never expose status_code; proceed and let publish fail if needed.


def _normalize_image_urls(
    image_url: str,
    image_urls: Optional[list] = None,
) -> list[str]:
    urls: list[str] = []
    primary = str(image_url or "").strip()
    if primary:
        urls.append(primary)
    for raw in list(image_urls or []):
        u = str(raw or "").strip()
        if u and u not in urls:
            urls.append(u)
    return urls


async def publish_image(
    brand: str,
    caption: str,
    image_url: str = "",
    kind: str = "feed",
    image_urls: Optional[list] = None,
) -> Dict[str, Any]:
    brand_key = normalize_brand(brand)
    if brand_key not in VALID_BRANDS:
        raise HTTPException(status_code=400, detail="Unknown brand")
    row = instagram_store.get_brand(brand_key)
    if not row or not row.get("pageAccessToken") or not row.get("igUserId"):
        raise HTTPException(status_code=400, detail="Instagram is not connected for this brand")

    urls = _normalize_image_urls(image_url, image_urls)
    if not urls:
        raise HTTPException(
            status_code=400,
            detail="Instagram requires a public https:// image URL for publishing",
        )
    for u in urls:
        if not u.lower().startswith("https://"):
            raise HTTPException(
                status_code=400,
                detail="Instagram requires public https:// image URLs for publishing",
            )
    if len(urls) > 10:
        raise HTTPException(
            status_code=400,
            detail="Instagram carousels support at most 10 images",
        )

    token = row["pageAccessToken"]
    ig_user_id = row["igUserId"]
    caption = (caption or "").strip()
    media_kind = (kind or "feed").strip().lower()
    if media_kind not in ("feed", "story"):
        raise HTTPException(status_code=400, detail="kind must be feed or story")
    if media_kind == "story" and len(urls) > 1:
        raise HTTPException(
            status_code=400,
            detail="Stories only support a single image (not carousels)",
        )

    async with httpx.AsyncClient(timeout=90.0) as client:
        if len(urls) == 1:
            create_data: Dict[str, Any] = {
                "image_url": urls[0],
                "access_token": token,
            }
            if media_kind == "story":
                create_data["media_type"] = "STORIES"
            else:
                create_data["caption"] = caption

            create_res = await client.post(
                f"https://graph.facebook.com/{api_version()}/{ig_user_id}/media",
                data=create_data,
            )
            if create_res.status_code >= 400:
                raise HTTPException(
                    status_code=400,
                    detail=f"Create media failed: {create_res.text}",
                )
            creation_id = (create_res.json() or {}).get("id")
            if not creation_id:
                raise HTTPException(status_code=400, detail="No creation_id from Instagram")

            if media_kind == "story":
                await _wait_media_ready(
                    client, creation_id, token, label="Story"
                )

            publish_res = await client.post(
                f"https://graph.facebook.com/{api_version()}/{ig_user_id}/media_publish",
                data={
                    "creation_id": creation_id,
                    "access_token": token,
                },
            )
            if publish_res.status_code >= 400:
                raise HTTPException(
                    status_code=400,
                    detail=f"Publish failed: {publish_res.text}",
                )
            media_id = (publish_res.json() or {}).get("id")
            return {
                "ok": True,
                "mediaId": media_id,
                "creationId": creation_id,
                "kind": media_kind,
                "carousel": False,
                "slideCount": 1,
            }

        # Carousel: create child items, then parent container, then publish.
        child_ids: list[str] = []
        for i, url in enumerate(urls):
            child_res = await client.post(
                f"https://graph.facebook.com/{api_version()}/{ig_user_id}/media",
                data={
                    "image_url": url,
                    "is_carousel_item": "true",
                    "access_token": token,
                },
            )
            if child_res.status_code >= 400:
                raise HTTPException(
                    status_code=400,
                    detail=f"Carousel item {i + 1} failed: {child_res.text}",
                )
            child_id = (child_res.json() or {}).get("id")
            if not child_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"No creation_id for carousel item {i + 1}",
                )
            await _wait_media_ready(
                client, child_id, token, label=f"Carousel item {i + 1}"
            )
            child_ids.append(str(child_id))

        parent_data: Dict[str, Any] = {
            "media_type": "CAROUSEL",
            "children": ",".join(child_ids),
            "access_token": token,
        }
        if caption:
            parent_data["caption"] = caption

        parent_res = await client.post(
            f"https://graph.facebook.com/{api_version()}/{ig_user_id}/media",
            data=parent_data,
        )
        if parent_res.status_code >= 400:
            raise HTTPException(
                status_code=400,
                detail=f"Create carousel failed: {parent_res.text}",
            )
        creation_id = (parent_res.json() or {}).get("id")
        if not creation_id:
            raise HTTPException(status_code=400, detail="No carousel creation_id")

        await _wait_media_ready(client, creation_id, token, label="Carousel")

        publish_res = await client.post(
            f"https://graph.facebook.com/{api_version()}/{ig_user_id}/media_publish",
            data={
                "creation_id": creation_id,
                "access_token": token,
            },
        )
        if publish_res.status_code >= 400:
            raise HTTPException(
                status_code=400,
                detail=f"Publish failed: {publish_res.text}",
            )
        media_id = (publish_res.json() or {}).get("id")

    return {
        "ok": True,
        "mediaId": media_id,
        "creationId": creation_id,
        "kind": media_kind,
        "carousel": True,
        "slideCount": len(urls),
    }
