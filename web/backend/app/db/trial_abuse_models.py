"""
SQLAlchemy models: trial abuse prevention (identity-based, not user_id quota).

Use a dedicated SQLite file (see trial_abuse_session) to avoid Prisma schema drift.
"""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class TrialAbuseBase(DeclarativeBase):
    pass


class TrialIdentity(TrialAbuseBase):
    """
    One row per signup attempt that participates in free-trial abuse logic.

    Free trial is granted on this row (trial_granted_at), not by mutating auth User.plan.
    """

    __tablename__ = "trial_identities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    identity_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    normalized_email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    device_id_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    registration_ip_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    #: Optional link to your auth user row (audit only; do not use for trial quota).
    external_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    email_verified_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_granted_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    #: If False, email may still verify but trial_granted_at must stay null (abuse rules).
    trial_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    verification_tokens: Mapped[list["TrialEmailVerificationToken"]] = relationship(
        back_populates="identity",
        cascade="all, delete-orphan",
    )


class TrialEmailVerificationToken(TrialAbuseBase):
    __tablename__ = "trial_email_verification_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    identity_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("trial_identities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    #: HMAC hex of the opaque token emailed to the user.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    identity: Mapped["TrialIdentity"] = relationship(back_populates="verification_tokens")


class DeviceTrialConsumption(TrialAbuseBase):
    """First successful trial grant locks the device from receiving another trial."""

    __tablename__ = "device_trial_consumption"

    device_id_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    identity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    trial_granted_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class IpRegistrationEvent(TrialAbuseBase):
    """Append-only: registrations per hashed IP for sliding-window limits."""

    __tablename__ = "ip_registration_events"
    __table_args__ = (Index("ix_ip_registration_events_ip_created", "ip_hash", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ip_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
