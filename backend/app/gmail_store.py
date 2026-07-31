"""Persist Gmail OAuth tokens for the Support inbox (single shared mailbox).

Primary: Supabase `app_storage` (survives Railway restarts/redeploys).
Fallback: local JSON file under GMAIL_TOKEN_PATH or /data.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

from .config import get_settings

_lock = threading.Lock()

STORAGE_KEY = "support_gmail_oauth"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _store_path() -> Path:
    raw = os.getenv("GMAIL_TOKEN_PATH", "").strip()
    if raw:
        return Path(raw)
    data_dir = Path("/data")
    if data_dir.exists() and data_dir.is_dir():
        return data_dir / "gmail_oauth.json"
    return Path(__file__).resolve().parent.parent / "data" / "gmail_oauth.json"


def _supabase_config() -> Optional[tuple[str, str]]:
    s = get_settings()
    url = (s.supabase_url or os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (
        s.supabase_service_role_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    ).strip()
    if url and key:
        return url, key
    return None


def _read_file() -> Dict[str, Any]:
    path = _store_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_file(data: Dict[str, Any]) -> None:
    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(path)


def _read_supabase() -> Optional[Dict[str, Any]]:
    cfg = _supabase_config()
    if not cfg:
        return None
    url, key = cfg
    endpoint = (
        f"{url}/rest/v1/app_storage"
        f"?key=eq.{STORAGE_KEY}&select=value"
    )
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.get(endpoint, headers=headers)
        if res.status_code >= 400:
            print(f"[gmail_store] supabase read failed ({res.status_code}): {res.text[:300]}")
            return None
        rows = res.json()
        if isinstance(rows, list) and rows:
            value = rows[0].get("value")
            if isinstance(value, dict):
                return value
            if isinstance(value, str):
                try:
                    parsed = json.loads(value)
                    return parsed if isinstance(parsed, dict) else None
                except Exception:
                    return None
    except Exception as exc:
        print(f"[gmail_store] supabase read error: {exc}")
    return None


def _write_supabase(data: Dict[str, Any]) -> bool:
    cfg = _supabase_config()
    if not cfg:
        return False
    url, key = cfg
    endpoint = f"{url}/rest/v1/app_storage?on_conflict=key"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    row = {
        "key": STORAGE_KEY,
        "value": data,
        "updated_at": _now(),
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.post(endpoint, headers=headers, json=row)
        if res.status_code >= 400:
            print(f"[gmail_store] supabase write failed ({res.status_code}): {res.text[:300]}")
            return False
        return True
    except Exception as exc:
        print(f"[gmail_store] supabase write error: {exc}")
        return False


def _delete_supabase() -> None:
    cfg = _supabase_config()
    if not cfg:
        return
    url, key = cfg
    endpoint = f"{url}/rest/v1/app_storage?key=eq.{STORAGE_KEY}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            client.delete(endpoint, headers=headers)
    except Exception as exc:
        print(f"[gmail_store] supabase delete error: {exc}")


def _read() -> Dict[str, Any]:
    remote = _read_supabase()
    if remote is not None:
        return remote
    return _read_file()


def _write(data: Dict[str, Any]) -> None:
    # Always keep a local copy for speed / offline fallback
    try:
        _write_file(data)
    except Exception as exc:
        print(f"[gmail_store] file write error: {exc}")
    _write_supabase(data)


def get_tokens() -> Optional[Dict[str, Any]]:
    with _lock:
        data = _read()
    if not data.get("access_token") and not data.get("refresh_token"):
        return None
    return data


def save_tokens(payload: Dict[str, Any]) -> Dict[str, Any]:
    with _lock:
        current = _read()
        merged = {**current, **payload, "updatedAt": _now()}
        # Keep refresh_token if Google omits it on refresh
        if not merged.get("refresh_token") and current.get("refresh_token"):
            merged["refresh_token"] = current["refresh_token"]
        _write(merged)
        return merged


def clear_tokens() -> None:
    with _lock:
        path = _store_path()
        if path.exists():
            try:
                path.unlink()
            except Exception:
                pass
        _delete_supabase()


def save_oauth_state(state: str) -> None:
    with _lock:
        data = _read()
        data["oauthState"] = state
        data["oauthStateAt"] = _now()
        _write(data)


def consume_oauth_state(state: str) -> bool:
    with _lock:
        data = _read()
        expected = data.get("oauthState")
        data.pop("oauthState", None)
        data.pop("oauthStateAt", None)
        _write(data)
    return bool(expected) and expected == state


def get_auto_reply(thread_id: str) -> Optional[Dict[str, Any]]:
    tid = (thread_id or "").strip()
    if not tid:
        return None
    with _lock:
        data = _read()
    replies = data.get("autoReplies") or {}
    row = replies.get(tid)
    return row if isinstance(row, dict) else None


def save_auto_reply(thread_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    tid = (thread_id or "").strip()
    if not tid:
        raise ValueError("thread_id required")
    with _lock:
        data = _read()
        replies = dict(data.get("autoReplies") or {})
        row = {**payload, "at": _now()}
        replies[tid] = row
        # Keep file bounded
        if len(replies) > 500:
            ordered = sorted(
                replies.items(),
                key=lambda kv: str((kv[1] or {}).get("at") or ""),
            )
            replies = dict(ordered[-400:])
        data["autoReplies"] = replies
        data["updatedAt"] = _now()
        _write(data)
        return row
