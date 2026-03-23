"""
Destek sohbeti (WhatsApp Cloud API backend) için yapılandırma.

Öncelik sırası:
1) Ortam değişkenleri: NB_SUPPORT_API_BASE_URL, NB_SUPPORT_API_KEY
2) Çalışma dizinindeki support_config.json
3) Proje kökündeki support_config.json (src'nin üst dizini)
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def _load_json_file(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def load_support_config() -> dict[str, Any]:
    file_data: dict[str, Any] = {}
    cwd_file = Path.cwd() / "support_config.json"
    root_file = _project_root() / "support_config.json"
    if cwd_file.is_file():
        file_data.update(_load_json_file(cwd_file))
    elif root_file.is_file():
        file_data.update(_load_json_file(root_file))

    base_url = (os.environ.get("NB_SUPPORT_API_BASE_URL") or file_data.get("api_base_url") or "").strip()
    api_key = (os.environ.get("NB_SUPPORT_API_KEY") or file_data.get("api_key") or "").strip() or None
    poll_seconds = file_data.get("poll_interval_seconds")
    try:
        poll_interval = float(poll_seconds) if poll_seconds is not None else 2.5
    except (TypeError, ValueError):
        poll_interval = 2.5
    poll_interval = max(1.0, min(poll_interval, 30.0))

    path_prefix = (
        os.environ.get("NB_SUPPORT_API_PREFIX", "").strip()
        or str(file_data.get("api_path_prefix", "")).strip()
    )

    return {
        "api_base_url": base_url,
        "api_key": api_key,
        "poll_interval_seconds": poll_interval,
        "api_path_prefix": path_prefix,
    }
