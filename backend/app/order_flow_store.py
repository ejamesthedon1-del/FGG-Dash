from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_lock = threading.Lock()

STAGES = (
    "needs_blanks",
    "blanks_ordered",
    "ready_for_production",
    "in_production",
    "ready_to_ship",
    "shipped",
)


def _store_path() -> Path:
    raw = os.getenv("ORDER_FLOW_PATH", "").strip()
    if raw:
        return Path(raw)
    data_dir = Path("/data")
    if data_dir.exists() and data_dir.is_dir():
        return data_dir / "order_flow.json"
    return Path(__file__).resolve().parent.parent / "data" / "order_flow.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty() -> Dict[str, Any]:
    return {"orders": {}}


def _record_key(brand: str, shopify_order_id: str) -> str:
    return f"{brand}::{shopify_order_id}"


def load_all() -> Dict[str, Any]:
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


def get_record(brand: str, shopify_order_id: str) -> Optional[Dict[str, Any]]:
    key = _record_key(brand, shopify_order_id)
    return load_all()["orders"].get(key)


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

    path = _store_path()
    key = _record_key(brand, shopify_order_id)
    now = _now()

    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = _empty()
        if path.exists():
            try:
                parsed = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(parsed, dict) and isinstance(parsed.get("orders"), dict):
                    data = parsed
            except Exception:
                data = _empty()

        orders: Dict[str, Any] = data.setdefault("orders", {})
        existing = orders.get(key) if isinstance(orders.get(key), dict) else {}
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
        orders[key] = record

        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp.replace(path)
        return record


def update_notes(brand: str, shopify_order_id: str, notes: str) -> Dict[str, Any]:
    path = _store_path()
    key = _record_key(brand, shopify_order_id)
    now = _now()

    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = _empty()
        if path.exists():
            try:
                parsed = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(parsed, dict) and isinstance(parsed.get("orders"), dict):
                    data = parsed
            except Exception:
                data = _empty()

        orders: Dict[str, Any] = data.setdefault("orders", {})
        existing = orders.get(key) if isinstance(orders.get(key), dict) else {}
        record = {
            "brand": brand,
            "shopifyOrderId": shopify_order_id,
            "orderName": existing.get("orderName") or "",
            "stage": existing.get("stage") or "needs_blanks",
            "notes": notes,
            "history": list(existing.get("history") or []),
            "updatedAt": now,
            "createdAt": existing.get("createdAt") or now,
        }
        orders[key] = record
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp.replace(path)
        return record


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
