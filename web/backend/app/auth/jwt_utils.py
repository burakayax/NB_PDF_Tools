"""Erisim JWT dogrulama (Node jsonwebtoken / HS256 ile uyumlu)."""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from jwt.exceptions import InvalidTokenError


@dataclass(frozen=True, slots=True)
class AccessTokenPayload:
    sub: str
    email: str
    type: str


def decode_access_token(token: str, secret: str) -> AccessTokenPayload:
    try:
        raw = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
    except InvalidTokenError as exc:
        raise ValueError("Invalid or expired token.") from exc

    if raw.get("type") != "access":
        raise ValueError("Invalid access token.")

    sub = raw.get("sub")
    email = raw.get("email")
    if not isinstance(sub, str) or not sub.strip():
        raise ValueError("Invalid access token.")
    if not isinstance(email, str):
        email = ""

    return AccessTokenPayload(sub=sub.strip(), email=email, type="access")
