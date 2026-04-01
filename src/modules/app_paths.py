"""
Resolve bundled resources in development and PyInstaller frozen builds.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def meipass() -> str | None:
    return getattr(sys, "_MEIPASS", None)


def resource_path(*relative_parts: str) -> str:
    """
    Path to a file shipped with the app (assets, locales, etc.).

    - Dev: project root relative to ``src/`` (parent of ``modules``).
    - Frozen: ``sys._MEIPASS`` (PyInstaller onefile/onedir).
    """
    parts = [p for p in relative_parts if p]
    if not parts:
        raise ValueError("relative_parts required")
    if is_frozen() and meipass():
        base = Path(meipass() or "")
    else:
        # src/modules/app_paths.py -> project root
        base = Path(__file__).resolve().parent.parent.parent
    return str(base.joinpath(*parts))
