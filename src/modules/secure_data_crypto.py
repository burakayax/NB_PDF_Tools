"""
Yerel hassas veri için AES-256-GCM şifreleme ve PBKDF2 anahtar türetme.

- Ödeme kartı PAN/CVC/CVV asla uygulama içinde tutulmamalı; PCI DSS için kart verisi
  yalnızca ödeme sağlayıcısı (ör. iyzico) üzerinden, tokenize edilmiş akışlarla işlenir.
- Oturumlar sunucuda JWT + HttpOnly çerez ile yönetilir; bu modül diskte saklanacak
  küçük gizli blob'lar (ör. cihaza özel yapılandırma) için kullanılabilir.

Bağımlılık: proje kökündeki pycryptodome (PyCryptodome).
"""

from __future__ import annotations

import hmac
import secrets
from typing import Final

from Crypto.Cipher import AES
from Crypto.Hash import SHA256
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Random import get_random_bytes

_NONCE_LEN: Final = 12
_TAG_LEN: Final = 16
_KEY_LEN: Final = 32
_DEFAULT_PBKDF2_ITERATIONS: Final = 390_000

__all__ = [
    "derive_aes256_key_pbkdf2",
    "seal_aes256_gcm",
    "open_aes256_gcm",
    "generate_salt",
    "constant_time_equal",
]


def generate_salt(nbytes: int = 16) -> bytes:
    """Rastgele tuz (salt) üretir."""
    return secrets.token_bytes(nbytes)


def derive_aes256_key_pbkdf2(
    password: str | bytes,
    salt: bytes,
    *,
    iterations: int = _DEFAULT_PBKDF2_ITERATIONS,
) -> bytes:
    """
    PBKDF2-HMAC-SHA256 ile 32 bayt (AES-256) anahtar türetir.
    OWASP önerilerine yakın iterasyon sayısı kullanılır.
    """
    if len(salt) < 16:
        raise ValueError("salt must be at least 16 bytes")
    pw = password.encode("utf-8") if isinstance(password, str) else password
    if not pw:
        raise ValueError("password must be non-empty")
    return PBKDF2(pw, salt, dkLen=_KEY_LEN, count=iterations, hmac_hash_module=SHA256)


def seal_aes256_gcm(plaintext: bytes, key32: bytes, *, aad: bytes | None = None) -> bytes:
    """
    AES-256-GCM ile şifreler. Çıktı: nonce (12) || ciphertext || tag (16).
    """
    if len(key32) != _KEY_LEN:
        raise ValueError("key must be 32 bytes (AES-256)")
    nonce = get_random_bytes(_NONCE_LEN)
    cipher = AES.new(key32, AES.MODE_GCM, nonce=nonce)
    if aad is not None:
        cipher.update(aad)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)
    return nonce + ciphertext + tag


def open_aes256_gcm(blob: bytes, key32: bytes, *, aad: bytes | None = None) -> bytes:
    """seal_aes256_gcm çıktısını doğrular ve düz metni döndürür."""
    if len(key32) != _KEY_LEN:
        raise ValueError("key must be 32 bytes (AES-256)")
    if len(blob) < _NONCE_LEN + _TAG_LEN:
        raise ValueError("invalid sealed blob")
    nonce = blob[:_NONCE_LEN]
    tag = blob[-_TAG_LEN:]
    ciphertext = blob[_NONCE_LEN : -_TAG_LEN]
    cipher = AES.new(key32, AES.MODE_GCM, nonce=nonce)
    if aad is not None:
        cipher.update(aad)
    return cipher.decrypt_and_verify(ciphertext, tag)


def constant_time_equal(a: bytes, b: bytes) -> bool:
    """Sabit süreli bayt karşılaştırma (kısa sırlar / kod doğrulama için)."""
    return len(a) == len(b) and hmac.compare_digest(a, b)
