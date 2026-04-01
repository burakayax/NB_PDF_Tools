"""
SQLite / SQL enjeksiyonuna karşı: yalnızca parametre bağlama kullanın.

user_repository modülündeki gibi `?` yer tutucuları ve tuple parametreleri kullanın.
Dinamik tanımlayıcı (tablo/sütun adı) gerekiyorsa aşağıdaki allowlist ile sınırlayın.
"""

from __future__ import annotations

import re

_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def assert_safe_identifier(name: str, *, allowed: frozenset[str] | None = None) -> str:
    """
    SQL tanımlayıcısı için sıkı doğrulama (tablo/sütun adı string birleştirmeyecek
    olsa bile savunma katmanı).
    """
    if not name or not _IDENTIFIER_RE.match(name):
        raise ValueError("invalid SQL identifier")
    if allowed is not None and name not in allowed:
        raise ValueError("identifier not in allowlist")
    return name
