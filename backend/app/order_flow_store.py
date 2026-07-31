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
    "in_production",
    "ready_to_ship",
    "shipped",
)

# Older boards used extra hops — map into the current path.
STAGE_ALIASES = {
    "ready_for_production": "in_production",
}


def normalize_stage(stage: Optional[str]) -> str:
    raw = (stage or "needs_blanks").strip()
    mapped = STAGE_ALIASES.get(raw, raw)
    return mapped if mapped in STAGES else "needs_blanks"


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


def _extract_blanks_receipt(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    receipt = record.get("blanksReceipt")
    if isinstance(receipt, dict) and receipt.get("dataUrl"):
        return receipt
    history = record.get("history") or []
    if not isinstance(history, list):
        return None
    for entry in reversed(history):
        if not isinstance(entry, dict):
            continue
        nested = entry.get("receipt")
        if isinstance(nested, dict) and nested.get("dataUrl"):
            return nested
    return None


def get_blanks_receipt(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return _extract_blanks_receipt(record)


def blanks_receipt_meta(receipt: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """List-safe receipt (no base64 dataUrl) so order-flow payloads stay small."""
    if not isinstance(receipt, dict):
        return None
    data_url = str(receipt.get("dataUrl") or "").strip()
    name = str(receipt.get("name") or "").strip()
    if not data_url and not name:
        return None
    return {
        "name": name or "Blanks order receipt",
        "mimeType": str(receipt.get("mimeType") or "").strip(),
        "uploadedAt": receipt.get("uploadedAt"),
        "hasFile": bool(data_url),
    }


def slim_history_for_list(history: Any) -> List[Dict[str, Any]]:
    """Drop nested receipt dataUrls from history (they duplicate blanksReceipt)."""
    if not isinstance(history, list):
        return []
    out: List[Dict[str, Any]] = []
    for entry in history:
        if not isinstance(entry, dict):
            continue
        slim = dict(entry)
        nested = slim.get("receipt")
        if isinstance(nested, dict):
            meta = blanks_receipt_meta(nested)
            if meta:
                slim["receipt"] = meta
            else:
                slim.pop("receipt", None)
        out.append(slim)
    return out


def _extract_risk_review(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    review = record.get("riskReview")
    if isinstance(review, dict) and str(review.get("status") or "").lower() in {
        "approved",
        "denied",
    }:
        return review
    history = record.get("history") or []
    if not isinstance(history, list):
        return None
    for entry in reversed(history):
        if not isinstance(entry, dict):
            continue
        nested = entry.get("riskReview")
        if isinstance(nested, dict) and str(nested.get("status") or "").lower() in {
            "approved",
            "denied",
        }:
            return nested
    return None


def get_risk_review(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return _extract_risk_review(record)


def _normalize_blanks_receipt(value: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(value, dict):
        return None
    name = str(value.get("name") or "").strip()
    data_url = str(value.get("dataUrl") or "").strip()
    mime = str(value.get("mimeType") or "").strip() or "application/octet-stream"
    if not name or not data_url.startswith("data:"):
        return None
    # Keep receipts modest for JSON / PostgREST payloads.
    if len(data_url) > 3_500_000:
        raise ValueError("Blanks receipt is too large (max ~2.5 MB)")
    return {
        "name": name[:200],
        "mimeType": mime[:120],
        "dataUrl": data_url,
        "uploadedAt": str(value.get("uploadedAt") or _now()),
    }


def _row_to_record(row: Dict[str, Any]) -> Dict[str, Any]:
    history = row.get("history") or []
    if isinstance(history, str):
        try:
            history = json.loads(history)
        except Exception:
            history = []
    record = {
        "brand": row.get("brand") or "",
        "shopifyOrderId": row.get("shopify_order_id") or "",
        "orderName": row.get("order_name") or "",
        "stage": normalize_stage(row.get("stage")),
        "notes": row.get("notes") or "",
        "history": history if isinstance(history, list) else [],
        "updatedAt": row.get("updated_at") or "",
        "createdAt": row.get("created_at") or "",
    }
    receipt = _extract_blanks_receipt(record)
    if receipt:
        record["blanksReceipt"] = receipt
    risk = _extract_risk_review(record)
    if risk:
        record["riskReview"] = risk
    supplies = get_supplies_applied(record)
    if supplies:
        record["suppliesApplied"] = supplies
    return record


def _record_to_row(record: Dict[str, Any], record_id: str) -> Dict[str, Any]:
    # blanksReceipt + riskReview + suppliesApplied live inside history (no schema migration).
    history = list(record.get("history") or [])
    risk = _extract_risk_review(record)
    if risk:
        last = history[-1] if history else None
        if not (
            isinstance(last, dict)
            and isinstance(last.get("riskReview"), dict)
            and last["riskReview"].get("status") == risk.get("status")
            and last["riskReview"].get("decidedAt") == risk.get("decidedAt")
        ):
            history.append(
                {
                    "stage": record.get("stage") or "needs_blanks",
                    "at": risk.get("decidedAt") or _now(),
                    "by": risk.get("decidedBy") or "ops",
                    "from": record.get("stage"),
                    "riskReview": risk,
                }
            )
    supplies = get_supplies_applied(record)
    if supplies:
        has_stamp = any(
            isinstance(e, dict)
            and (
                e.get("suppliesApplied") is True
                or (
                    isinstance(e.get("suppliesApplied"), dict)
                    and e["suppliesApplied"].get("at") == supplies.get("at")
                )
            )
            for e in history
        )
        if not has_stamp:
            history.append(
                {
                    "stage": record.get("stage") or "needs_blanks",
                    "at": supplies.get("at") or _now(),
                    "by": supplies.get("by") or "ops",
                    "from": record.get("stage"),
                    "suppliesApplied": supplies,
                }
            )
    return {
        "id": record_id,
        "brand": record["brand"],
        "shopify_order_id": record["shopifyOrderId"],
        "order_name": record.get("orderName") or "",
        "stage": record["stage"],
        "notes": record.get("notes") or "",
        "history": history[-100:],
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
                f"Supabase upsert failed ({response.status_code}): {response.text[:800]}"
            )
        if not response.content:
            return record
        try:
            body = response.json()
        except Exception as exc:
            raise RuntimeError(
                f"Supabase upsert returned non-JSON ({response.status_code}): {response.text[:300]}"
            ) from exc
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
            raw_stage = row.get("stage") or "needs_blanks"
            record = _row_to_record(row)
            orders[rid] = record
            # Persist collapsed stages so durable store matches the simplified board.
            if raw_stage != record["stage"]:
                try:
                    _upsert_supabase(url, key, {**record, "stage": record["stage"]}, rid)
                except Exception:
                    pass
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
    normalized: Dict[str, Any] = {}
    changed = False
    for key, value in orders.items():
        if not isinstance(value, dict):
            continue
        rec = dict(value)
        raw = rec.get("stage") or "needs_blanks"
        stage = normalize_stage(raw)
        if stage != raw:
            rec["stage"] = stage
            changed = True
        normalized[key] = rec
    data = {"orders": normalized}
    if changed:
        try:
            _write_all_file(data)
        except Exception:
            pass
    return data


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
    blanks_receipt: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    stage = normalize_stage(stage)
    if stage not in STAGES:
        raise ValueError(f"Invalid stage: {stage}")

    receipt = _normalize_blanks_receipt(blanks_receipt) if blanks_receipt else None

    key = _record_key(brand, shopify_order_id)
    now = _now()
    existing = get_record(brand, shopify_order_id) or {}
    history: List[Dict[str, Any]] = list(existing.get("history") or [])
    prev = existing.get("stage")
    if prev != stage:
        entry: Dict[str, Any] = {"stage": stage, "at": now, "by": actor, "from": prev}
        if receipt:
            entry["receipt"] = receipt
        history.append(entry)
    elif receipt:
        # Same-stage update that only attaches a receipt (rare).
        history.append(
            {
                "stage": stage,
                "at": now,
                "by": actor,
                "from": prev,
                "receipt": receipt,
            }
        )

    existing_receipt = _extract_blanks_receipt(existing)
    existing_risk = _extract_risk_review(existing)
    record = {
        "brand": brand,
        "shopifyOrderId": shopify_order_id,
        "orderName": order_name or existing.get("orderName") or "",
        "stage": stage,
        "notes": notes if notes is not None else (existing.get("notes") or ""),
        "history": history[-100:],
        "updatedAt": now,
        "createdAt": existing.get("createdAt") or now,
        "blanksReceipt": receipt or existing_receipt,
    }
    if existing_risk:
        record["riskReview"] = existing_risk
    if not record.get("blanksReceipt"):
        record.pop("blanksReceipt", None)

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
    stage = normalize_stage(existing.get("stage"))
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
    blanks_receipt: Optional[Dict[str, Any]] = None,
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
                blanks_receipt=blanks_receipt,
            )
        )
    return out


def upsert_risk_review(
    brand: str,
    shopify_order_id: str,
    *,
    status: str,
    note: str = "",
    actor: str = "ops",
    order_name: Optional[str] = None,
    snapshot: Optional[Dict[str, Any]] = None,
    shopify_cancel_ok: Optional[bool] = None,
    shopify_error: Optional[str] = None,
    stage: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist approve/deny decision inside history (no schema migration)."""
    status_norm = (status or "").strip().lower()
    if status_norm not in {"approved", "denied"}:
        raise ValueError("Risk status must be approved or denied")

    key = _record_key(brand, shopify_order_id)
    now = _now()
    existing = get_record(brand, shopify_order_id) or {}
    history: List[Dict[str, Any]] = list(existing.get("history") or [])
    next_stage = normalize_stage(stage or existing.get("stage") or "needs_blanks")

    review: Dict[str, Any] = {
        "status": status_norm,
        "note": (note or "").strip()[:2000],
        "decidedBy": actor,
        "decidedAt": now,
    }
    if snapshot:
        review["snapshot"] = snapshot
    if shopify_cancel_ok is not None:
        review["shopifyCancelOk"] = bool(shopify_cancel_ok)
    data = _load_all_file()
    data.setdefault("orders", {})[key] = record
    _write_all_file(data)
    return record


def get_supplies_applied(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if isinstance(record.get("suppliesApplied"), dict):
        return record["suppliesApplied"]
    history = record.get("history") or []
    if not isinstance(history, list):
        return None
    for entry in reversed(history):
        if not isinstance(entry, dict):
            continue
        if entry.get("suppliesApplied") is True:
            return {"at": entry.get("at"), "by": entry.get("by")}
        nested = entry.get("suppliesApplied")
        if isinstance(nested, dict):
            return nested
    return None


def mark_supplies_applied(
    brand: str,
    shopify_order_id: str,
    *,
    actor: str = "ops",
    order_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Stamp that shop supplies were applied for this order (idempotent)."""
    key = _record_key(brand, shopify_order_id)
    now = _now()
    existing = get_record(brand, shopify_order_id) or {}
    already = get_supplies_applied(existing)
    if already:
        return existing

    history: List[Dict[str, Any]] = list(existing.get("history") or [])
    stage = normalize_stage(existing.get("stage") or "needs_blanks")
    stamp = {"at": now, "by": actor}
    history.append(
        {
            "stage": stage,
            "at": now,
            "by": actor,
            "from": existing.get("stage"),
            "suppliesApplied": stamp,
        }
    )

    receipt = _extract_blanks_receipt(existing)
    risk = _extract_risk_review(existing)
    record = {
        "brand": brand,
        "shopifyOrderId": shopify_order_id,
        "orderName": order_name or existing.get("orderName") or "",
        "stage": stage,
        "notes": existing.get("notes") or "",
        "history": history[-100:],
        "updatedAt": now,
        "createdAt": existing.get("createdAt") or now,
        "suppliesApplied": stamp,
    }
    if receipt:
        record["blanksReceipt"] = receipt
    if risk:
        record["riskReview"] = risk

    cfg = _supabase_config()
    if cfg:
        saved = _upsert_supabase(*cfg, record, key)
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
