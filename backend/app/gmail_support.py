"""Gmail OAuth + read-only inbox helpers for Support."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from . import gmail_store
from .config import get_settings

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
]
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1"


def gmail_configured() -> bool:
    s = get_settings()
    return bool((s.gmail_client_id or "").strip() and (s.gmail_client_secret or "").strip())


def redirect_uri() -> str:
    s = get_settings()
    return (s.gmail_redirect_uri or "http://localhost:8000/api/support/gmail/callback").strip()


def frontend_origin() -> str:
    s = get_settings()
    raw = (s.frontend_origin or "").strip()
    if raw:
        return raw.rstrip("/")
    origins = s.cors_origin_list()
    return (origins[0] if origins else "http://localhost:5173").rstrip("/")


def build_authorize_url() -> str:
    if not gmail_configured():
        raise HTTPException(
            status_code=503,
            detail="Gmail OAuth is not configured (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET).",
        )
    s = get_settings()
    state = secrets.token_urlsafe(24)
    gmail_store.save_oauth_state(state)
    params = {
        "client_id": s.gmail_client_id,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": " ".join(GMAIL_SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "select_account consent",
        "state": state,
    }
    # Optional — only if explicitly set. login_hint/hd often hide "Use another account".
    hint = (s.gmail_login_hint or "").strip()
    if hint:
        params["login_hint"] = hint
    hd = (s.gmail_hosted_domain or "").strip()
    if hd:
        params["hd"] = hd
    auth = f"{AUTH_URL}?{urlencode(params)}"
    # Route through AccountChooser so Chrome doesn't auto-bind the personal session.
    return "https://accounts.google.com/AccountChooser?" + urlencode(
        {"continue": auth}
    )


async def exchange_code(code: str) -> Dict[str, Any]:
    s = get_settings()
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": s.gmail_client_id,
                "client_secret": s.gmail_client_secret,
                "redirect_uri": redirect_uri(),
                "grant_type": "authorization_code",
            },
        )
    if res.status_code >= 400:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {res.text}")
    data = res.json()
    expires_in = int(data.get("expires_in") or 3600)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(60, expires_in - 60))
    saved = gmail_store.save_tokens(
        {
            "access_token": data.get("access_token"),
            "refresh_token": data.get("refresh_token"),
            "token_type": data.get("token_type") or "Bearer",
            "scope": data.get("scope") or "",
            "expiresAt": expires_at.isoformat(),
        }
    )
    email = await fetch_profile_email(saved["access_token"])
    if email:
        saved = gmail_store.save_tokens({"email": email})
    return saved


async def refresh_access_token(tokens: Dict[str, Any]) -> Dict[str, Any]:
    refresh = tokens.get("refresh_token")
    if not refresh:
        raise HTTPException(status_code=401, detail="Gmail disconnected — reconnect required.")
    s = get_settings()
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            TOKEN_URL,
            data={
                "client_id": s.gmail_client_id,
                "client_secret": s.gmail_client_secret,
                "refresh_token": refresh,
                "grant_type": "refresh_token",
            },
        )
    if res.status_code >= 400:
        raise HTTPException(status_code=401, detail=f"Gmail token refresh failed: {res.text}")
    data = res.json()
    expires_in = int(data.get("expires_in") or 3600)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(60, expires_in - 60))
    return gmail_store.save_tokens(
        {
            "access_token": data.get("access_token"),
            "token_type": data.get("token_type") or "Bearer",
            "scope": data.get("scope") or tokens.get("scope") or "",
            "expiresAt": expires_at.isoformat(),
        }
    )


def _token_expired(tokens: Dict[str, Any]) -> bool:
    raw = tokens.get("expiresAt")
    if not raw:
        return True
    try:
        expires = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= expires
    except Exception:
        return True


async def get_valid_access_token() -> tuple[str, Dict[str, Any]]:
    tokens = gmail_store.get_tokens()
    if not tokens:
        raise HTTPException(status_code=401, detail="Gmail is not connected.")
    if _token_expired(tokens) or not tokens.get("access_token"):
        tokens = await refresh_access_token(tokens)
    access = tokens.get("access_token")
    if not access:
        raise HTTPException(status_code=401, detail="Gmail is not connected.")
    return str(access), tokens


async def fetch_profile_email(access_token: str) -> Optional[str]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.get(
            USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if res.status_code >= 400:
        return None
    return (res.json().get("email") or "").strip() or None


def _header_map(payload: Dict[str, Any]) -> Dict[str, str]:
    headers = ((payload.get("payload") or {}).get("headers")) or []
    # Also allow calling with a message payload dict directly
    if "headers" in payload and "payload" not in payload:
        headers = payload.get("headers") or []
    out: Dict[str, str] = {}
    for h in headers:
        name = str(h.get("name") or "").strip().lower()
        if name:
            out[name] = str(h.get("value") or "")
    return out


def _parse_date(value: str) -> Optional[str]:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def _b64url_decode(data: str) -> bytes:
    import base64

    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


def _walk_parts(part: Dict[str, Any], out: List[tuple[str, str]]) -> None:
    mime = str(part.get("mimeType") or "")
    body = part.get("body") or {}
    data = body.get("data")
    if data and mime.startswith("text/"):
        try:
            text = _b64url_decode(data).decode("utf-8", errors="replace")
            out.append((mime, text))
        except Exception:
            pass
    for child in part.get("parts") or []:
        if isinstance(child, dict):
            _walk_parts(child, out)


def _extract_body(message: Dict[str, Any]) -> Dict[str, str]:
    payload = message.get("payload") or {}
    collected: List[tuple[str, str]] = []
    _walk_parts(payload, collected)
    plains = [t for m, t in collected if m == "text/plain" and t.strip()]
    htmls = [t for m, t in collected if m == "text/html" and t.strip()]
    # Prefer the longest plain body (main content vs tiny parts)
    plain = max(plains, key=len) if plains else ""
    html = max(htmls, key=len) if htmls else ""
    if not plain and not html and payload.get("body", {}).get("data"):
        try:
            raw = _b64url_decode(payload["body"]["data"]).decode(
                "utf-8", errors="replace"
            )
            if str(payload.get("mimeType") or "").startswith("text/html"):
                html = raw
            else:
                plain = raw
        except Exception:
            pass
    return {"text": plain.strip(), "html": html.strip()}


async def get_thread(thread_id: str) -> Dict[str, Any]:
    tid = (thread_id or "").strip()
    if not tid:
        raise HTTPException(status_code=400, detail="thread id required")
    access, tokens = await get_valid_access_token()
    async with httpx.AsyncClient(timeout=40.0) as client:
        res = await client.get(
            f"{GMAIL_API}/users/me/threads/{tid}",
            headers={"Authorization": f"Bearer {access}"},
            params={"format": "full"},
        )
        if res.status_code == 401:
            tokens = await refresh_access_token(tokens)
            access = tokens["access_token"]
            res = await client.get(
                f"{GMAIL_API}/users/me/threads/{tid}",
                headers={"Authorization": f"Bearer {access}"},
                params={"format": "full"},
            )
        if res.status_code == 404:
            raise HTTPException(status_code=404, detail="Thread not found")
        if res.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Gmail thread failed ({res.status_code}): {res.text}",
            )
        body = res.json()

    messages_out: List[Dict[str, Any]] = []
    subject = "(no subject)"
    for msg in body.get("messages") or []:
        headers = _header_map(msg)
        if headers.get("subject"):
            subject = headers["subject"]
        content = _extract_body(msg)
        messages_out.append(
            {
                "id": msg.get("id"),
                "from": headers.get("from") or "",
                "to": headers.get("to") or "",
                "subject": headers.get("subject") or subject,
                "date": _parse_date(headers.get("date") or "") or "",
                "snippet": msg.get("snippet") or "",
                "bodyText": content["text"],
                "bodyHtml": content["html"],
                "unread": "UNREAD" in (msg.get("labelIds") or []),
            }
        )

    return {
        "id": tid,
        "subject": subject,
        "messages": messages_out,
        "gmailUrl": f"https://mail.google.com/mail/u/0/#inbox/{tid}",
        "email": tokens.get("email"),
    }


async def list_inbox_threads(max_results: int = 30) -> Dict[str, Any]:
    access, tokens = await get_valid_access_token()
    params = {
        "maxResults": max(1, min(max_results, 50)),
        "q": "in:inbox newer_than:60d",
    }
    async with httpx.AsyncClient(timeout=40.0) as client:
        listed = await client.get(
            f"{GMAIL_API}/users/me/threads",
            headers={"Authorization": f"Bearer {access}"},
            params=params,
        )
        if listed.status_code == 401:
            tokens = await refresh_access_token(tokens)
            access = tokens["access_token"]
            listed = await client.get(
                f"{GMAIL_API}/users/me/threads",
                headers={"Authorization": f"Bearer {access}"},
                params=params,
            )
        if listed.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Gmail list failed ({listed.status_code}): {listed.text}",
            )
        thread_refs = listed.json().get("threads") or []

        threads: List[Dict[str, Any]] = []
        for ref in thread_refs:
            tid = ref.get("id")
            if not tid:
                continue
            detail = await client.get(
                f"{GMAIL_API}/users/me/threads/{tid}",
                headers={"Authorization": f"Bearer {access}"},
                params=[
                    ("format", "metadata"),
                    ("metadataHeaders", "From"),
                    ("metadataHeaders", "Subject"),
                    ("metadataHeaders", "Date"),
                ],
            )
            if detail.status_code >= 400:
                continue
            body = detail.json()
            messages = body.get("messages") or []
            if not messages:
                continue
            latest = messages[-1]
            headers = _header_map(latest)
            label_ids = latest.get("labelIds") or []
            threads.append(
                {
                    "id": tid,
                    "snippet": body.get("snippet") or latest.get("snippet") or "",
                    "subject": headers.get("subject") or "(no subject)",
                    "from": headers.get("from") or "",
                    "date": _parse_date(headers.get("date") or "") or "",
                    "unread": "UNREAD" in label_ids,
                    "messageCount": len(messages),
                    "gmailUrl": f"https://mail.google.com/mail/u/0/#inbox/{tid}",
                }
            )

    return {
        "connected": True,
        "email": tokens.get("email") or await fetch_profile_email(access),
        "threads": threads,
    }


async def get_connection_status() -> Dict[str, Any]:
    tokens = gmail_store.get_tokens()
    s = get_settings()
    base = {
        "configured": gmail_configured(),
        "clientId": (s.gmail_client_id or "").strip() or None,
        "redirectUri": redirect_uri(),
    }
    if not tokens:
        return {
            **base,
            "connected": False,
            "email": None,
        }
    try:
        access, tokens = await get_valid_access_token()
        email = tokens.get("email") or await fetch_profile_email(access)
        if email and email != tokens.get("email"):
            gmail_store.save_tokens({"email": email})
        return {
            **base,
            "connected": True,
            "email": email,
        }
    except HTTPException:
        return {
            **base,
            "connected": False,
            "email": tokens.get("email"),
        }
