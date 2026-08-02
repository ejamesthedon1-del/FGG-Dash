"""Persist Instagram (Meta) OAuth tokens per brand.

Primary: Supabase `app_storage` when configured.
Fallback: local JSON under /data or backend/data.
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

STORAGE_KEY = "instagram_oauth"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _store_path() -> Path:
    raw = os.getenv("INSTAGRAM_TOKEN_PATH", "").strip()
    if raw:
        return Path(raw)
    data_dir = Path("/data")
    if data_dir.exists() and data_dir.is_dir():
        return data_dir / "instagram_oauth.json"
    return Path(__file__).resolve().parent.parent / "data" / "instagram_oauth.json"


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
        return {"brands": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("brands", {})
            return data
    except Exception:
        pass
    return {"brands": {}}


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
        with httpx.Client(timeout=15.0) as client:
            res = client.get(endpoint, headers=headers)
        if res.status_code >= 400:
            return None
        rows = res.json()
        if not rows:
            return None
        value = rows[0].get("value")
        if isinstance(value, dict):
            value.setdefault("brands", {})
            return value
        if isinstance(value, str):
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                parsed.setdefault("brands", {})
                return parsed
    except Exception:
        return None
    return None


def _write_supabase(data: Dict[str, Any]) -> bool:
    cfg = _supabase_config()
    if not cfg:
        return False
    url, key = cfg
    endpoint = f"{url}/rest/v1/app_storage"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    body = {"key": STORAGE_KEY, "value": data}
    try:
        with httpx.Client(timeout=15.0) as client:
            res = client.post(endpoint, headers=headers, json=body)
        return res.status_code < 400
    except Exception:
        return False


def _read() -> Dict[str, Any]:
    remote = _read_supabase()
    if remote is not None:
        return remote
    return _read_file()


def _write(data: Dict[str, Any]) -> None:
    data = dict(data)
    data["updatedAt"] = _now()
    data.setdefault("brands", {})
    if not _write_supabase(data):
        _write_file(data)


def save_oauth_state(state: str, brand: str) -> None:
    with _lock:
        data = _read()
        data["oauthState"] = state
        data["oauthBrand"] = brand
        data["oauthStateAt"] = _now()
        _write(data)


def consume_oauth_state(state: str) -> Optional[str]:
    with _lock:
        data = _read()
        expected = data.get("oauthState")
        brand = data.get("oauthBrand")
        data.pop("oauthState", None)
        data.pop("oauthBrand", None)
        data.pop("oauthStateAt", None)
        _write(data)
        if not expected or expected != state:
            return None
        if not isinstance(brand, str) or not brand.strip():
            return None
        return brand.strip()


def get_brand(brand: str) -> Optional[Dict[str, Any]]:
    with _lock:
        data = _read()
        brands = data.get("brands") or {}
        row = brands.get(brand)
        return dict(row) if isinstance(row, dict) else None


def set_brand(brand: str, row: Dict[str, Any]) -> None:
    with _lock:
        data = _read()
        brands = dict(data.get("brands") or {})
        brands[brand] = {**row, "updatedAt": _now()}
        data["brands"] = brands
        _write(data)


def clear_brand(brand: str) -> None:
    with _lock:
        data = _read()
        brands = dict(data.get("brands") or {})
        brands.pop(brand, None)
        data["brands"] = brands
        _write(data)
