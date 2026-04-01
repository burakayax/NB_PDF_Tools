"""
E-posta kimligi normallestirme (Gmail / Googlemail).

src/modules/email_identity_normalize.py ile ayni mantik; FastAPI `app` paketinden import edilir.
"""

from __future__ import annotations

_GMAIL_FAMILY = frozenset({"gmail.com", "googlemail.com"})


class EmailAlreadyRegisteredError(ValueError):
    """Veritabaninda ayni normalize edilmis e-posta zaten var."""


def normalize_email_for_storage(email: str) -> str:
    raw = (email or "").strip()
    if "@" not in raw:
        raise ValueError("Invalid email address.")
    local, _, domain = raw.rpartition("@")
    if not local or not domain:
        raise ValueError("Invalid email address.")

    domain_l = domain.lower().strip()
    local_l = local.lower().strip()

    if domain_l in _GMAIL_FAMILY:
        local_n = local_l.replace(".", "")
        if "+" in local_n:
            local_n = local_n.split("+", 1)[0]
        local_n = local_n.strip()
        if not local_n:
            raise ValueError("Invalid Gmail local part.")
        return f"{local_n}@gmail.com"

    return f"{local_l}@{domain_l}"


def assert_email_unique_sqlalchemy(session: object, model_class: type, normalized_email: str) -> None:
    from sqlalchemy import select

    stmt = select(model_class).where(model_class.email == normalized_email).limit(1)
    row = session.execute(stmt).scalar_one_or_none()
    if row is not None:
        raise EmailAlreadyRegisteredError("An account with this email already exists.")
