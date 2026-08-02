"""Persist Instagram schedule queue (shared with frontend synced storage).

Primary: Supabase `app_storage` key `fgg.instagram-schedule.v1`.
Fallback: local JSON under /data or backend/data.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from .config import get_settings

_lock = threading.Lock()

STORAGE_KEY = "fgg.instagram-schedule.v1"
VALID_BRANDS = {"live-don", "sinners-testimony"}
VALID_STATUSES = {"draft", "scheduled", "publishing", "posted", "failed"}
VALID_KINDS = {"feed", "story"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _store_path() -> Path:
    raw = os.getenv("INSTAGRAM_SCHEDULE_PATH", "").strip()
    if raw:
        return Path(raw)
    data_dir = Path("/data")
    if data_dir.exists() and data_dir.is_dir():
        return data_dir / "instagram_schedule.json"
    return Path(__file__).resolve().parent.parent / "data" / "instagram_schedule.json"


def _supabase_config() -> Optional[tuple[str, str]]:
    s = get_settings()
    url = (s.supabase_url or os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (
        s.supabase_service_role_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    ).strip()
    if url and key:
        return url, key
    return None


def empty_store() -> Dict[str, Any]:
    return {"version": 1, "posts": []}


def _normalize_post(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    post_id = str(raw.get("id") or "").strip()
    brand = str(raw.get("brand") or "").strip()
    if not post_id or brand not in VALID_BRANDS:
        return None
    status = str(raw.get("status") or "").strip()
    if status not in VALID_STATUSES:
        return None
    scheduled_at = str(raw.get("scheduledAt") or "").strip()
    if not scheduled_at:
        return None
    kind = str(raw.get("kind") or "feed").strip().lower()
    if kind not in VALID_KINDS:
        kind = "feed"
    created_at = str(raw.get("createdAt") or "").strip() or _now()
    updated_at = str(raw.get("updatedAt") or "").strip() or created_at
    out: Dict[str, Any] = {
        "id": post_id,
        "brand": brand,
        "kind": kind,
        "caption": str(raw.get("caption") or ""),
        "scheduledAt": scheduled_at,
        "status": status,
        "createdAt": created_at,
        "updatedAt": updated_at,
    }
    for key in ("assetId", "assetName", "imageSrc", "postedAt", "lastError", "mediaId"):
        val = raw.get(key)
        if isinstance(val, str) and val:
            out[key] = val
    return out


def _normalize_store(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return empty_store()
    posts_raw = raw.get("posts")
    posts: List[Dict[str, Any]] = []
    if isinstance(posts_raw, list):
        for item in posts_raw:
            post = _normalize_post(item)
            if post:
                posts.append(post)
    return {"version": 1, "posts": posts}


def _read_file() -> Dict[str, Any]:
    path = _store_path()
    if not path.exists():
        return empty_store()
    try:
        return _normalize_store(json.loads(path.read_text(encoding="utf-8")))
    except Exception:
        return empty_store()


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
    endpoint = f"{url}/rest/v1/app_storage?key=eq.{STORAGE_KEY}&select=value"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.get(endpoint, headers=headers)
        if res.status_code >= 400:
            print(
                f"[ig_schedule] supabase read failed ({res.status_code}): {res.text[:300]}"
            )
            return None
        rows = res.json()
        if not isinstance(rows, list) or not rows:
            return None
        value = rows[0].get("value")
        if isinstance(value, dict):
            return _normalize_store(value)
        if isinstance(value, str):
            try:
                return _normalize_store(json.loads(value))
            except Exception:
                return None
    except Exception as exc:
        print(f"[ig_schedule] supabase read error: {exc}")
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
            print(
                f"[ig_schedule] supabase write failed ({res.status_code}): {res.text[:300]}"
            )
            return False
        return True
    except Exception as exc:
        print(f"[ig_schedule] supabase write error: {exc}")
        return False


def _status_rank(status: str) -> int:
    order = {
        "posted": 5,
        "failed": 4,
        "publishing": 3,
        "scheduled": 2,
        "draft": 1,
    }
    return order.get(status, 0)


def merge_posts(
    left: List[Dict[str, Any]], right: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Prefer newer updatedAt; on ties prefer more terminal status."""
    by_id: Dict[str, Dict[str, Any]] = {}
    for post in left + right:
        existing = by_id.get(post["id"])
        if existing is None:
            by_id[post["id"]] = post
            continue
        left_u = str(existing.get("updatedAt") or "")
        right_u = str(post.get("updatedAt") or "")
        if right_u > left_u:
            by_id[post["id"]] = post
        elif right_u == left_u and _status_rank(post["status"]) > _status_rank(
            existing["status"]
        ):
            by_id[post["id"]] = post
    return list(by_id.values())


def get_store() -> Dict[str, Any]:
    with _lock:
        remote = _read_supabase()
        if remote is not None:
            return remote
        return _read_file()


def put_store(data: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _normalize_store(data)
    with _lock:
        if not _write_supabase(normalized):
            _write_file(normalized)
        else:
            try:
                _write_file(normalized)
            except Exception:
                pass
        return normalized


def upsert_post(post: Dict[str, Any]) -> Dict[str, Any]:
    normalized_post = _normalize_post(post)
    if not normalized_post:
        raise ValueError("Invalid scheduled post")
    normalized_post["updatedAt"] = _now()
    with _lock:
        store = _read_supabase()
        if store is None:
            store = _read_file()
        posts = list(store.get("posts") or [])
        idx = next(
            (i for i, p in enumerate(posts) if p.get("id") == normalized_post["id"]),
            -1,
        )
        if idx >= 0:
            posts[idx] = normalized_post
        else:
            posts.insert(0, normalized_post)
        next_store = {"version": 1, "posts": posts}
        if not _write_supabase(next_store):
            _write_file(next_store)
        else:
            try:
                _write_file(next_store)
            except Exception:
                pass
        return next_store


def delete_post(post_id: str) -> Dict[str, Any]:
    post_id = (post_id or "").strip()
    with _lock:
        store = _read_supabase()
        if store is None:
            store = _read_file()
        posts = [p for p in (store.get("posts") or []) if p.get("id") != post_id]
        next_store = {"version": 1, "posts": posts}
        if not _write_supabase(next_store):
            _write_file(next_store)
        else:
            try:
                _write_file(next_store)
            except Exception:
                pass
        return next_store


def merge_and_put(incoming: Dict[str, Any]) -> Dict[str, Any]:
    incoming_norm = _normalize_store(incoming)
    with _lock:
        current = _read_supabase()
        if current is None:
            current = _read_file()
        merged = {
            "version": 1,
            "posts": merge_posts(
                list(current.get("posts") or []),
                list(incoming_norm.get("posts") or []),
            ),
        }
        if not _write_supabase(merged):
            _write_file(merged)
        else:
            try:
                _write_file(merged)
            except Exception:
                pass
        return merged
