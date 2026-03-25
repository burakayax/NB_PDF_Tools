"""Kimlik dogrulamali auth uclari (JWT + SQLite User tablosu)."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.deps import get_access_token_payload
from app.auth.jwt_utils import AccessTokenPayload
from app.auth.password_policy import new_password_strength_violation
from app.auth.password_utils import hash_password, verify_password
from app.config import Settings, get_settings
from app.db.user_repository import get_user_password_fields, update_user_password_hash

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=2048)
    new_password: str = Field(min_length=8, max_length=2048)


class ChangePasswordResponse(BaseModel):
    message: str


@router.post(
    "/change-password",
    response_model=ChangePasswordResponse,
    status_code=status.HTTP_200_OK,
)
def change_password(
    body: ChangePasswordRequest,
    token: Annotated[AccessTokenPayload, Depends(get_access_token_payload)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ChangePasswordResponse:
    try:
        db_path = settings.resolved_sqlite_path()
    except Exception:
        logger.exception("Could not resolve SQLite path for change-password")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication database is not available.",
        ) from None

    try:
        row = get_user_password_fields(db_path, token.sub)
    except FileNotFoundError:
        logger.error("SQLite file missing at %s", db_path)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication database is not available.",
        ) from None
    except Exception:
        logger.exception("Database read failed for user_id=%s", token.sub)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not verify account.",
        ) from None

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account could not be found.",
        )

    if not row.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account does not use a password. Use Google sign-in or contact support if you need access.",
        )

    if not verify_password(body.current_password, row.password_hash):
        logger.warning("change-password rejected: wrong current password user_id=%s", token.sub)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    if body.current_password == body.new_password:
        logger.warning("change-password rejected: new equals current user_id=%s", token.sub)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from your current password.",
        )

    strength_err = new_password_strength_violation(body.new_password)
    if strength_err:
        logger.warning("change-password rejected: weak password user_id=%s", token.sub)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=strength_err,
        )

    new_hash = hash_password(body.new_password)
    try:
        ok = update_user_password_hash(db_path, token.sub, new_hash)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication database is not available.",
        ) from None
    except Exception:
        logger.exception("Database update failed for user_id=%s", token.sub)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not update password.",
        ) from None

    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account could not be found.",
        )

    logger.info(
        "security_event type=password_changed user_id=%s",
        token.sub,
    )
    return ChangePasswordResponse(message="Password has been updated successfully.")
