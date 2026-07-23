from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any, Dict

_lock = threading.Lock()


def _store_path() -> Path:
    raw = os.getenv("PRODUCT_COSTS_PATH", "").strip()
    if raw:
        return Path(raw)
    # Prefer /data when a Railway volume is mounted; else local backend data dir.
    data_dir = Path("/data")
    if data_dir.exists() and data_dir.is_dir():
        return data_dir / "product_costs.json"
    return Path(__file__).resolve().parent.parent / "data" / "product_costs.json"


def _empty() -> Dict[str, Dict[str, Dict[str, float]]]:
    return {}


def _normalize_costs(raw: Any) -> Dict[str, Dict[str, float]]:
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, Dict[str, float]] = {}
    for title, cost in raw.items():
        if not isinstance(title, str) or not isinstance(cost, dict):
            continue
        garment = float(cost.get("garmentCost") or 0)
        labor = float(cost.get("laborCost") or 0)
        out[title] = {"garmentCost": garment, "laborCost": labor}
    return out


def load_all() -> Dict[str, Dict[str, Dict[str, float]]]:
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
    out: Dict[str, Dict[str, Dict[str, float]]] = {}
    for brand, products in parsed.items():
        if isinstance(brand, str):
            out[brand] = _normalize_costs(products)
    return out


def load_brand(brand: str) -> Dict[str, Dict[str, float]]:
    return load_all().get(brand, {})


def save_brand(brand: str, costs: Dict[str, Any]) -> Dict[str, Dict[str, float]]:
    brand = brand.strip()
    normalized = _normalize_costs(costs)
    path = _store_path()
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        all_costs = {}
        if path.exists():
            try:
                parsed = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(parsed, dict):
                    all_costs = parsed
            except Exception:
                all_costs = {}
        all_costs[brand] = normalized
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(all_costs, indent=2), encoding="utf-8")
        tmp.replace(path)
    return normalized
