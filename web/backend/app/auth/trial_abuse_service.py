"""
Trial abuse prevention: backend-only enforcement.

- Identity = HMAC(normalized_email, device_id, IP) at registration time.
- Free trial activates only after email verification and passing abuse checks.
- Login / account creation can proceed; trial_eligible may be False (no trial perks).
"""

from __future__ import annotations

import datetime as dt
import secrets
import uuid
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.auth.email_identity_normalize import normalize_email_for_storage
from app.auth.trial_abuse_crypto import (
    compute_trial_identity_key,
    hash_email_verification_token,
)
from app.config import Settings
from app.db.trial_abuse_models import (
    DeviceTrialConsumption,
    IpRegistrationEvent,
    TrialEmailVerificationToken,
    TrialIdentity,
)


class TrialAbuseError(Exception):
    """Base for policy violations (map to HTTP in routers)."""


class IdentityTrialAlreadyUsedError(TrialAbuseError):
    """This identity already received a free trial."""


class InvalidVerificationTokenError(TrialAbuseError):
    """Unknown, expired, or already consumed token."""


_VERIFICATION_TTL = dt.timedelta(hours=72)
_DUMMY_HASH_HEX = "00" * 32  # 64 hex chars; same length as SHA256 hex


@dataclass(frozen=True, slots=True)
class TrialRegistrationBeginResult:
    """Return `plain_verification_token` to embed in the verification link only (never store)."""

    identity_id: str
    verification_token_id: str
    plain_verification_token: str
    trial_eligible: bool
    normalized_email: str


@dataclass(frozen=True, slots=True)
class TrialVerificationResult:
    email_verified: bool
    trial_granted: bool
    identity_id: str


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


def _as_utc_aware(value: dt.datetime) -> dt.datetime:
    """SQLite often returns naive datetimes; normalize for comparison."""
    if value.tzinfo is None:
        return value.replace(tzinfo=dt.UTC)
    return value.astimezone(dt.UTC)


def _count_recent_ip_registrations(session: Session, ip_hash: str, since: dt.datetime) -> int:
    stmt = select(func.count()).select_from(IpRegistrationEvent).where(
        IpRegistrationEvent.ip_hash == ip_hash,
        IpRegistrationEvent.created_at >= since,
    )
    return int(session.scalar(stmt) or 0)


def begin_trial_registration(
    session: Session,
    settings: Settings,
    *,
    raw_email: str,
    device_id_raw: str,
    client_ip: str,
    external_user_id: str | None = None,
    now: dt.datetime | None = None,
) -> TrialRegistrationBeginResult:
    """
    Call after creating the auth user row (or atomically in the same transaction).

    - Normalizes Gmail-style addresses.
    - Records hashed IP for sliding-window limits (does not block signup).
    - Marks trial_eligible=False when device or IP heuristics disallow trial.
    - Always creates a verification token; trial is granted only in verify_email_and_maybe_grant_trial.
    """
    now = now or _utcnow()
    normalized = normalize_email_for_storage(raw_email)
    secret = settings.trial_abuse_hmac_secret
    identity_key, device_h, ip_h = compute_trial_identity_key(
        normalized_email=normalized,
        device_id_raw=device_id_raw,
        client_ip=client_ip,
        hmac_secret=secret,
    )

    stmt = select(TrialIdentity).where(TrialIdentity.identity_key == identity_key).limit(1)
    identity = session.scalars(stmt).first()
    if identity is not None and identity.trial_granted_at is not None:
        raise IdentityTrialAlreadyUsedError("This identity has already used the free trial.")

    trial_eligible = True
    if session.get(DeviceTrialConsumption, device_h) is not None:
        trial_eligible = False

    window_start = now - dt.timedelta(hours=settings.trial_abuse_ip_window_hours)
    recent = _count_recent_ip_registrations(session, ip_h, window_start)
    if recent >= settings.trial_abuse_max_regs_per_ip_window:
        trial_eligible = False

    session.add(IpRegistrationEvent(id=str(uuid.uuid4()), ip_hash=ip_h))

    if identity is None:
        identity = TrialIdentity(
            id=str(uuid.uuid4()),
            identity_key=identity_key,
            normalized_email=normalized,
            device_id_hash=device_h,
            registration_ip_hash=ip_h,
            external_user_id=external_user_id,
            trial_eligible=trial_eligible,
        )
        session.add(identity)
    else:
        identity.trial_eligible = trial_eligible
        identity.external_user_id = external_user_id or identity.external_user_id

    session.flush()

    # Invalidate prior pending tokens for this identity (resend flow).
    session.execute(
        delete(TrialEmailVerificationToken).where(
            TrialEmailVerificationToken.identity_id == identity.id,
            TrialEmailVerificationToken.consumed_at.is_(None),
        )
    )

    plain = secrets.token_urlsafe(32)
    token_hash = hash_email_verification_token(plain, secret)
    ver = TrialEmailVerificationToken(
        id=str(uuid.uuid4()),
        identity_id=identity.id,
        token_hash=token_hash,
        expires_at=now + _VERIFICATION_TTL,
    )
    session.add(ver)
    session.flush()

    return TrialRegistrationBeginResult(
        identity_id=identity.id,
        verification_token_id=ver.id,
        plain_verification_token=plain,
        trial_eligible=trial_eligible,
        normalized_email=normalized,
    )


def verify_email_and_maybe_grant_trial(
    session: Session,
    settings: Settings,
    *,
    verification_token_id: str,
    plain_token: str,
    now: dt.datetime | None = None,
) -> TrialVerificationResult:
    """
    Constant-time token check; sets email_verified_at.
    Grants trial (trial_granted_at + device lock) only when trial_eligible and device is free.
    """
    now = now or _utcnow()
    secret = settings.trial_abuse_hmac_secret
    computed = hash_email_verification_token(plain_token.strip(), secret)

    row = session.get(TrialEmailVerificationToken, verification_token_id)
    stored = row.token_hash if row is not None else _DUMMY_HASH_HEX
    if not secrets.compare_digest(computed.encode("ascii"), stored.encode("ascii")):
        raise InvalidVerificationTokenError("Invalid or expired verification link.")

    assert row is not None
    expires_at = _as_utc_aware(row.expires_at)
    if row.consumed_at is not None or expires_at < now:
        raise InvalidVerificationTokenError("Invalid or expired verification link.")

    identity = session.get(TrialIdentity, row.identity_id)
    if identity is None:
        raise InvalidVerificationTokenError("Invalid or expired verification link.")

    row.consumed_at = now
    identity.email_verified_at = now

    trial_granted = False
    if identity.trial_granted_at is None and identity.trial_eligible:
        cons = session.get(DeviceTrialConsumption, identity.device_id_hash)
        if cons is None:
            identity.trial_granted_at = now
            session.add(
                DeviceTrialConsumption(
                    device_id_hash=identity.device_id_hash,
                    identity_id=identity.id,
                    trial_granted_at=now,
                )
            )
            trial_granted = True

    session.flush()
    return TrialVerificationResult(
        email_verified=True,
        trial_granted=trial_granted,
        identity_id=identity.id,
    )
