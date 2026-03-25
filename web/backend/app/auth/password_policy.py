"""Yeni sifre kurallari (Node API ile ayni politika)."""

from __future__ import annotations

import re

NEW_PASSWORD_MIN_LEN = 10
NEW_PASSWORD_MAX_LEN = 128


def new_password_strength_violation(password: str) -> str | None:
    """Guclu sifre degilse Ingilizce hata metni, aksi halde None."""
    if len(password) < NEW_PASSWORD_MIN_LEN:
        return "Password must be at least 10 characters."
    if len(password) > NEW_PASSWORD_MAX_LEN:
        return "Password is too long."
    if not re.search(r"[a-z]", password):
        return "Password must include a lowercase letter."
    if not re.search(r"[A-Z]", password):
        return "Password must include an uppercase letter."
    if not re.search(r"\d", password):
        return "Password must include a number."
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must include a symbol."
    return None
