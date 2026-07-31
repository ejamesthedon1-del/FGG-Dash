"""Persist Gmail OAuth tokens for the Support inbox (single shared mailbox)."""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

_lock = threading.Lock()


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


def _read() -> Dict[str, Any]:
    path = _store_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write(data: Dict[str, Any]) -> None:
    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(path)


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
            path.unlink()


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
