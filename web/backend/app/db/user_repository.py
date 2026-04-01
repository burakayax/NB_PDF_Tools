"""Kullanici parola alani okuma/guncelleme (ham SQLite).

Guvenlik: Tum sorgular parametre baglama (? yer tutucu) kullanir; SQL enjeksiyonuna karsi
dinamik SQL birlestirme yapilmaz. Dinamik tanimlayici gerekiyorsa query_safety.assert_safe_identifier kullanin.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class UserPasswordRow:
    password_hash: str | None
    auth_provider: str


def _connect(db_path: Path, *, read_only: bool = False) -> sqlite3.Connection:
    if not db_path.is_file():
        raise FileNotFoundError(f"SQLite database not found: {db_path}")
    if read_only:
        uri = f"file:{db_path.as_posix()}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
    else:
        conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def get_user_password_fields(db_path: Path, user_id: str) -> UserPasswordRow | None:
    """User id (JWT sub) ile passwordHash ve authProvider doner."""
    conn = _connect(db_path, read_only=True)
    try:
        cur = conn.execute(
            'SELECT "passwordHash" AS ph, "authProvider" AS ap FROM "User" WHERE id = ?',
            (user_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return UserPasswordRow(
            password_hash=row["ph"] if row["ph"] is not None else None,
            auth_provider=str(row["ap"] or "local"),
        )
    finally:
        conn.close()


def update_user_password_hash(db_path: Path, user_id: str, password_hash: str) -> bool:
    """Parola ozetini gunceller; etkilenen satir sayisi 1 olmali."""
    conn = _connect(db_path, read_only=False)
    try:
        cur = conn.execute(
            'UPDATE "User" SET "passwordHash" = ?, "updatedAt" = datetime(\'now\') WHERE id = ?',
            (password_hash, user_id),
        )
        conn.commit()
        return cur.rowcount == 1
    finally:
        conn.close()
