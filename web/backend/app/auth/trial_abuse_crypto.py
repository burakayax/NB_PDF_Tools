"""
HMAC-based hashing for IPs, device ids, and composite trial identity keys.

All identifiers are derived with a server secret (pepper); store only hex digests.
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Final

_SEP: Final[str] = "\n"  # avoid ambiguity vs email local-part dots


def _hmac_hex(secret: str, purpose: str, value: str) -> str:
    key = secret.encode("utf-8")
    msg = f"{purpose}{_SEP}{value}".encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def hash_ip_for_trial(client_ip: str, hmac_secret: str) -> str:
    """HMAC-SHA256 hex for client IP (use trusted proxy-derived IP only)."""
    ip = (client_ip or "").strip()
    if not ip:
        return _hmac_hex(hmac_secret, "ip", "unknown")
    return _hmac_hex(hmac_secret, "ip", ip)


def hash_device_id_for_trial(device_id: str, hmac_secret: str) -> str:
    """HMAC-SHA256 hex for raw device_id from header / desktop file."""
    did = (device_id or "").strip()
    if len(did) < 8:
        raise ValueError("device_id is missing or too short.")
    return _hmac_hex(hmac_secret, "device", did)


def compute_trial_identity_key(
    *,
    normalized_email: str,
    device_id_raw: str,
    client_ip: str,
    hmac_secret: str,
) -> tuple[str, str, str]:
    """
    Returns (identity_key, device_id_hash, registration_ip_hash).

    identity_key binds normalized_email + device + IP at registration time.
    """
    device_h = hash_device_id_for_trial(device_id_raw, hmac_secret)
    ip_h = hash_ip_for_trial(client_ip, hmac_secret)
    key = hmac.new(
        hmac_secret.encode("utf-8"),
        f"identity{_SEP}{normalized_email}{_SEP}{device_h}{_SEP}{ip_h}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return key, device_h, ip_h


def hash_email_verification_token(token: str, hmac_secret: str) -> str:
    """Store only HMAC of opaque token (constant-time verify against recomputed hash)."""
    return _hmac_hex(hmac_secret, "ev_token", token.strip())
