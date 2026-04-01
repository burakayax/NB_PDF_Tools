"""
E-posta kimligi normallestirme (Gmail / Googlemail).

Kurallar (yalnizca @gmail.com ve @googlemail.com icin Google'in yerel kisim kurallari):
- Tum harfler kucuk
- Yerel kisimdaki noktalar kaldirilir
- '+' ve sonrasi kaldirilir (plus addressing)
- googlemail.com -> gmail.com (ayni posta kutusu)

Diger saglayicilar: yalnizca trim + kucuk harf (yerel kisimda nokta/plus degismez).

SQLAlchemy 2.0 ile benzersizlik ornegi::

    from sqlalchemy import select
    from sqlalchemy.orm import Session

    normalized = normalize_email_for_storage(raw_email)
    existing = session.execute(
        select(User).where(User.email == normalized).limit(1)
    ).scalar_one_or_none()
    if existing is not None:
        raise EmailAlreadyRegisteredError("An account with this email already exists.")
    user = User(email=normalized, password_hash=...)
    session.add(user)
    session.commit()
"""

from __future__ import annotations

_GMAIL_FAMILY = frozenset({"gmail.com", "googlemail.com"})


class EmailAlreadyRegisteredError(ValueError):
    """Veritabaninda ayni normalize edilmis e-posta zaten var."""


def normalize_email_for_storage(email: str) -> str:
    """
    Kayit / giris icin tek tip e-posta dondurur.

    Gmail ailesi: kucuk harf, noktasiz yerel kisim, + etiketi yok, alan adi gmail.com.
    Digerleri: local@domain kucuk harf.
    """
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
    """
    SQLAlchemy 2.0 oturumunda `model_class.email == normalized_email` satiri var mi bakar.
    Modelde `email` sutunu benzersiz olmalidir (unique constraint / index).

    Raises:
        EmailAlreadyRegisteredError: Kayit varsa.
        ModuleNotFoundError: sqlalchemy yuklu degilse.
    """
    from sqlalchemy import select

    stmt = select(model_class).where(model_class.email == normalized_email).limit(1)
    row = session.execute(stmt).scalar_one_or_none()
    if row is not None:
        raise EmailAlreadyRegisteredError("An account with this email already exists.")


# --- Ornek: kayit is akisi (kopyalayip uyarlayin) ---
def _sample_register_workflow() -> None:
    """
    Ornek (sozde; calistirmak icin gercek Session / User modeli gerekir)::

        def register_user(session: Session, raw_email: str, password_hash: str) -> User:
            normalized = normalize_email_for_storage(raw_email)
            assert_email_unique_sqlalchemy(session, User, normalized)
            user = User(email=normalized, password_hash=password_hash)
            session.add(user)
            session.flush()
            return user
    """
    raise RuntimeError("This is documentation-only sample; import and adapt in your app.")
