"""Güvenli rastgele belirteçler ve sabit süreli karşılaştırma (oturum / durum sırları)."""

from __future__ import annotations

import hmac
import secrets


def generate_opaque_token(nbytes: int = 32) -> str:
    """URL-güvenli, tahmin edilemez belirteç (sunucu tarafı oturum anahtarı vb.)."""
    return secrets.token_urlsafe(nbytes)


def constant_time_compare(a: str, b: str) -> bool:
    """İki metni sabit sürede karşılaştırır (zamanlama sızıntısını azaltır)."""
    try:
        ae = a.encode("utf-8")
        be = b.encode("utf-8")
    except Exception:
        return False
    return len(ae) == len(be) and hmac.compare_digest(ae, be)
