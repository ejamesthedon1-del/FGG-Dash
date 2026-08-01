from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any, Dict

_lock = threading.Lock()


def _store_path() -> Path:
    raw = os.getenv("SHOP_SUPPLIES_PATH", "").strip()
    if raw:
        return Path(raw)
    data_dir = Path("/data")
    if data_dir.exists() and data_dir.is_dir():
        return data_dir / "shop_supplies.json"
    return Path(__file__).resolve().parent.parent / "data" / "shop_supplies.json"


def _empty() -> Dict[str, Any]:
    return {}


def load_all() -> Dict[str, Any]:
    path = _store_path()
    with _lock:
        if not path.exists():
            return _empty()
        try:
            parsed = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return _empty()
    return parsed if isinstance(parsed, dict) else _empty()


def save_all(store: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(store, dict):
        store = {}
    path = _store_path()
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(store, indent=2), encoding="utf-8")
        tmp.replace(path)
    return store
