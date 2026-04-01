"""
Registration helpers + optional FastAPI example routes for free-trial abuse prevention.

Calistirmak icin: pip install sqlalchemy fastapi (projede zorunlu degil; referans moduldur).

Gercek uygulamada:
- `register_user_example` ile Gmail-normalize + benzersiz e-posta.
- `begin_trial_registration` / `verify_email_and_maybe_grant_trial` ile deneme suresi
  yalnizca dogrulama ve abuse kurallarindan sonra (user_id'ye bagli olmadan identity uzerinden).

Ornek router'ı acmak icin `main.py` icinde:
    from app.auth.registration_workflow_example import example_router
    app.include_router(example_router, prefix="/api")
"""

from __future__ import annotations

import logging
from collections.abc import Generator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.api.trial_deps import RequiredNbDeviceId, get_request_client_ip
from app.auth.email_identity_normalize import (
    EmailAlreadyRegisteredError,
    assert_email_unique_sqlalchemy,
    normalize_email_for_storage,
)
from app.auth.trial_abuse_service import (
    IdentityTrialAlreadyUsedError,
    InvalidVerificationTokenError,
    TrialRegistrationBeginResult,
    begin_trial_registration,
    verify_email_and_maybe_grant_trial,
)
from app.config import Settings, get_settings
from app.db.trial_abuse_session import trial_abuse_session_factory

logger = logging.getLogger(__name__)


def register_user_example(
    session: Any,
    user_model: type,
    *,
    raw_email: str,
    password_hash: str,
) -> Any:
    """
    Ornek kayit adimlari:
    1) normalize_email_for_storage
    2) assert_email_unique_sqlalchemy -> EmailAlreadyRegisteredError
    3) ORM nesnesi olustur
    """
    normalized = normalize_email_for_storage(raw_email)
    assert_email_unique_sqlalchemy(session, user_model, normalized)
    user = user_model(email=normalized, password_hash=password_hash)
    session.add(user)
    return user


# --- SQLAlchemy 2.0 declarative ornek (ayri bir models.py'ye tasinabilir) ---
"""
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
"""


def _trial_session_dep(
    settings: Annotated[Settings, Depends(get_settings)],
) -> Generator[Session, None, None]:
    factory = trial_abuse_session_factory(settings)
    session = factory()
    try:
        yield session
    finally:
        session.close()


TrialSession = Annotated[Session, Depends(_trial_session_dep)]


class ExampleRegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=2048)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)


class ExampleVerifyBody(BaseModel):
    verification_token_id: str = Field(min_length=10, max_length=80)
    token: str = Field(min_length=10, max_length=500)


example_router = APIRouter(prefix="/example/trial-abuse", tags=["example-trial-abuse"])


@example_router.post("/register", status_code=status.HTTP_201_CREATED)
def example_register_flow(
    request: Request,
    body: ExampleRegisterBody,
    settings: Annotated[Settings, Depends(get_settings)],
    trial_session: TrialSession,
    device_id: RequiredNbDeviceId,
) -> dict[str, Any]:
    """
    Pseudocode endpoint: replace `User` ORM with your real model and password hashing.

    - Gmail normalization + unique email: `register_user_example` / `normalize_email_for_storage`.
    - Trial rows live in the separate SQLite file from Settings (trial_abuse.sqlite).
    """
    client_ip = get_request_client_ip(request)
    try:
        normalize_email_for_storage(body.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    external_user_id = "user_cuid_placeholder"
    try:
        # register_user_example(trial_session, User, raw_email=body.email, password_hash=hash_pw(...))
        pass
    except EmailAlreadyRegisteredError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    try:
        result: TrialRegistrationBeginResult = begin_trial_registration(
            trial_session,
            settings,
            raw_email=body.email,
            device_id_raw=device_id,
            client_ip=client_ip,
            external_user_id=external_user_id,
        )
        trial_session.commit()
    except IdentityTrialAlreadyUsedError as exc:
        trial_session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        trial_session.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        trial_session.rollback()
        logger.exception("trial begin_registration failed")
        raise HTTPException(status_code=500, detail="Registration could not be completed.") from None

    # send_email(link=f"https://app/verify?vid={result.verification_token_id}&t={result.plain_verification_token}")
    _ = result.plain_verification_token  # noqa: F841 — send only inside email, never log

    return {
        "message": "Check your email to verify your address.",
        "normalized_email": result.normalized_email,
        "trial_eligible": result.trial_eligible,
        "verification_token_id": result.verification_token_id,
    }


@example_router.post("/verify-email", status_code=status.HTTP_200_OK)
def example_verify_flow(
    body: ExampleVerifyBody,
    settings: Annotated[Settings, Depends(get_settings)],
    trial_session: TrialSession,
) -> dict[str, Any]:
    try:
        out = verify_email_and_maybe_grant_trial(
            trial_session,
            settings,
            verification_token_id=body.verification_token_id.strip(),
            plain_token=body.token.strip(),
        )
        trial_session.commit()
    except InvalidVerificationTokenError as exc:
        trial_session.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        trial_session.rollback()
        logger.exception("trial verify failed")
        raise HTTPException(status_code=500, detail="Verification failed.") from None

    return {
        "email_verified": out.email_verified,
        "trial_granted": out.trial_granted,
        "identity_id": out.identity_id,
    }
