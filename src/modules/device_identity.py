"""
Persistent desktop device identifier (unique per install when not using legacy migration).
Sent as X-NB-Device-Id; server hashes and enforces the account device cap.
"""

from __future__ import annotations

import hashlib
import os
import platform
import secrets
from pathlib import Path


def _legacy_machine_bound_id() -> str:
    """Deterministic id matching pre-persistence desktop builds (same machine = same id)."""
    machine_guid = None
    try:
        import winreg  # type: ignore[import-not-found]

        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
            machine_guid, _ = winreg.QueryValueEx(key, "MachineGuid")
    except (ImportError, OSError):
        machine_guid = platform.node() or "unknown-device"

    raw = f"NBPDFPLARTFORM::{machine_guid}::{platform.system()}::{platform.machine()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _identity_path() -> Path:
    root = Path(os.environ.get("APPDATA") or Path.home())
    d = root / "NB PDF PLARTFORM"
    d.mkdir(parents=True, exist_ok=True)
    return d / "device_identity.key"


def get_device_id() -> str:
    """
    Returns a stable id stored under %APPDATA%\\NB PDF PLARTFORM\\device_identity.key.

    Default first write uses the legacy machine-bound hash so existing server-side device rows
    remain valid. Set NB_PDF_DEVICE_LEGACY=0 for a new cryptographically random id per install.
    """
    path = _identity_path()
    if path.is_file():
        raw = path.read_text(encoding="utf-8").strip()
        if len(raw) >= 16:
            return raw
    use_legacy = os.environ.get("NB_PDF_DEVICE_LEGACY", "1") == "1"
    new_id = _legacy_machine_bound_id() if use_legacy else secrets.token_urlsafe(32)
    path.write_text(new_id, encoding="utf-8")
    return new_id
