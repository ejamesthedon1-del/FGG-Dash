"""
Order Flow stage persistence.

Primary (production): Supabase table `order_flow_stages` — durable, shared across
every device and browser indefinitely.

Fallback (local/dev): JSON file under ORDER_FLOW_PATH or /data/order_flow.json.
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

STAGES = (
    "needs_blanks",
    "blanks_ordered",
    "ready_for_production",
    "in_production",
    "ready_to_ship",
    "shipped",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty() -> Dict[str, Any]:
    return {"orders": {}}


def _record_key(brand: str, shopify_order_id: str) -> str:
    return f"{brand}::{shopify_order_id}"


def _supabase_config() -> Optional[tuple[str, str]]:
    s = get_settings()
    url = (s.supabase_url or os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (s.supabase_service_role_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if url and key:
        return url, key
    return None


def persistence_backend() -> str:
    if _supabase_config():
        return "supabase"
    return "file"


def _store_path() -> Path:
    raw = os.getenv("ORDER_FLOW_PATH", "").strip()
    if raw:
        return Path(raw)
    data_dir = Path("/data")
    if data_dir.exists() and data_dir.is_dir():
        return data_dir / "order_flow.json"
    return Path(__file__).resolve().parent.parent / "data" / "order_flow.json"


def _row_to_record(row: Dict[str, Any]) -> Dict[str, Any]:
    history = row.get("history") or []
    if isinstance(history, str):
        try:
            history = json.loads(history)
        except Exception:
            history = []
    return {
        "brand": row.get("brand") or "",
        "shopifyOrderId": row.get("shopify_order_id") or "",
        "orderName": row.get("order_name") or "",
        "stage": row.get("stage") or "needs_blanks",
        "notes": row.get("notes") or "",
        "history": history if isinstance(history, list) else [],
        "updatedAt": row.get("updated_at") or "",
        "createdAt": row.get("created_at") or "",
    }


def _record_to_row(record: Dict[str, Any], record_id: str) -> Dict[str, Any]:
    return {
        "id": record_id,
        "brand": record["brand"],
        "shopify_order_id": record["shopifyOrderId"],
        "order_name": record.get("orderName") or "",
        "stage": record["stage"],
        "notes": record.get("notes") or "",
        "history": record.get("history") or [],
        "updated_at": record.get("updatedAt") or _now(),
        "created_at": record.get("createdAt") or _now(),
    }


def _upsert_supabase(url: str, key: str, record: Dict[str, Any], record_id: str) -> Dict[str, Any]:
    # PostgREST upsert requires on_conflict=<pk> with merge-duplicates.
    endpoint = f"{url}/rest/v1/order_flow_stages?on_conflict=id"
    row = _record_to_row(record, record_id)
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    with httpx.Client(timeout=30.0) as client:
        response = client.post(endpoint, headers=headers, json=row)
        if response.status_code >= 400:
            raise RuntimeError(
                f"Supabase upsert failed ({response.status_code}): {response.text[:500]}"
            )
        body = response.json()
    if isinstance(body, list) and body:
        return _row_to_record(body[0])
    if isinstance(body, dict) and body.get("id"):
        return _row_to_record(body)
    return record


def _load_all_supabase(url: str, key: str) -> Dict[str, Any]:
    endpoint = f"{url}/rest/v1/order_flow_stages?select=*"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=30.0) as client:
        response = client.get(endpoint, headers=headers)
        if response.status_code >= 400:
            raise RuntimeError(
                f"Supabase load failed ({response.status_code}): {response.text[:500]}"
            )
        rows = response.json()
    orders: Dict[str, Any] = {}
    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, dict):
                continue
            rid = row.get("id") or _record_key(
                str(row.get("brand") or ""), str(row.get("shopify_order_id") or "")
            )
            orders[rid] = _row_to_record(row)
    return {"orders": orders}


def _load_all_file() -> Dict[str, Any]:
    path = _store_path()
    with _lock:
        if not path.exists():
            return _empty()
        try:
            parsed = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return _empty()
    if not isinstance(parsed, dict):
        return _empty()
    orders = parsed.get("orders")
    if not isinstance(orders, dict):
        return _empty()
    return {"orders": orders}


def _write_all_file(data: Dict[str, Any]) -> None:
    path = _store_path()
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp.replace(path)


def load_all() -> Dict[str, Any]:
    cfg = _supabase_config()
    if cfg:
        try:
            return _load_all_supabase(*cfg)
        except Exception as exc:
            # Fall back to file so a temporary Supabase outage does not blank the board.
            print(f"[order_flow_store] supabase load failed, using file fallback: {exc}")
            return _load_all_file()
    return _load_all_file()


def get_record(brand: str, shopify_order_id: str) -> Optional[Dict[str, Any]]:
    key = _record_key(brand, shopify_order_id)
    return load_all()["orders"].get(key)


def storage_status() -> Dict[str, Any]:
    backend = persistence_backend()
    orders = load_all().get("orders") or {}
    return {
        "backend": backend,
        "durable": backend == "supabase",
        "recordCount": len(orders),
        "filePath": str(_store_path()) if backend == "file" else None,
    }


def upsert_stage(
    brand: str,
    shopify_order_id: str,
    stage: str,
    *,
    notes: Optional[str] = None,
    actor: str = "ops",
    order_name: Optional[str] = None,
) -> Dict[str, Any]:
    if stage not in STAGES:
        raise ValueError(f"Invalid stage: {stage}")

    key = _record_key(brand, shopify_order_id)
    now = _now()
    existing = get_record(brand, shopify_order_id) or {}
    history: List[Dict[str, Any]] = list(existing.get("history") or [])
    prev = existing.get("stage")
    if prev != stage:
        history.append({"stage": stage, "at": now, "by": actor, "from": prev})

    record = {
        "brand": brand,
        "shopifyOrderId": shopify_order_id,
        "orderName": order_name or existing.get("orderName") or "",
        "stage": stage,
        "notes": notes if notes is not None else (existing.get("notes") or ""),
        "history": history[-100:],
        "updatedAt": now,
        "createdAt": existing.get("createdAt") or now,
    }

    cfg = _supabase_config()
    if cfg:
        saved = _upsert_supabase(*cfg, record, key)
        # Mirror to file as an extra local backup when possible.
        try:
            data = _load_all_file()
            data.setdefault("orders", {})[key] = saved
            _write_all_file(data)
        except Exception:
            pass
        return saved

    data = _load_all_file()
    data.setdefault("orders", {})[key] = record
    _write_all_file(data)
    return record


def update_notes(brand: str, shopify_order_id: str, notes: str) -> Dict[str, Any]:
    existing = get_record(brand, shopify_order_id) or {}
    stage = existing.get("stage") or "needs_blanks"
    return upsert_stage(
        brand,
        shopify_order_id,
        stage,
        notes=notes,
        actor="ops",
        order_name=existing.get("orderName"),
    )


def bulk_upsert_stage(
    items: List[Dict[str, str]],
    stage: str,
    *,
    actor: str = "ops",
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for item in items:
        out.append(
            upsert_stage(
                item["brand"],
                item["shopifyOrderId"],
                stage,
                actor=actor,
                order_name=item.get("orderName"),
            )
        )
    return out
