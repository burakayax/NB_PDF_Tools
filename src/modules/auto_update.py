"""
Optional update check against a JSON manifest (HTTPS).

Set ``update_manifest_url`` in desktop_auth_config.json or env NB_UPDATE_MANIFEST_URL.

Manifest example::
    { "version": "1.0.1", "download_url": "https://cdn.example.com/NB_PDF_TOOLS_Setup.exe", "notes": "Optional" }
"""

from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.request
from typing import Any

from packaging.version import InvalidVersion, Version

from version_info import __version__


def _fetch_json(url: str, timeout: float = 12.0) -> dict[str, Any] | None:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "NB-PDF-TOOLS-Desktop"})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw)
            return data if isinstance(data, dict) else None
    except (urllib.error.URLError, json.JSONDecodeError, OSError, ValueError):
        return None


def compare_versions(remote: str, local: str | None = None) -> int:
    """Return 1 if remote > local, 0 if equal, -1 if remote < local or invalid."""
    local = local or __version__
    try:
        rv = Version(remote)
        lv = Version(local)
        if rv > lv:
            return 1
        if rv < lv:
            return -1
        return 0
    except InvalidVersion:
        return 0


def check_manifest(manifest_url: str) -> tuple[bool, str | None, str | None]:
    """
    Returns (update_available, latest_version_or_None, download_url_or_None).

    Raises OSError if the manifest could not be fetched or parsed.
    """
    if not manifest_url or not manifest_url.startswith("http"):
        raise OSError("Invalid update manifest URL.")
    data = _fetch_json(manifest_url.strip())
    if not data:
        raise OSError("Could not download or parse the update manifest.")
    ver = data.get("version")
    url = data.get("download_url")
    if not isinstance(ver, str) or not ver.strip():
        raise OSError("Manifest is missing a valid version field.")
    if compare_versions(ver.strip(), __version__) != 1:
        return False, ver.strip(), None
    dl = url.strip() if isinstance(url, str) and url.strip() else None
    return True, ver.strip(), dl
