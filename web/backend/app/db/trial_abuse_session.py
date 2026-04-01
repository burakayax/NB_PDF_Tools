"""Engine/session factory for trial-abuse tables (separate SQLite file)."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings

from .trial_abuse_models import TrialAbuseBase

_engines: dict[str, Engine] = {}


def trial_abuse_sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def get_trial_abuse_engine(settings: Settings) -> Engine:
    path = settings.resolved_trial_abuse_sqlite_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    key = str(path)
    existing = _engines.get(key)
    if existing is not None:
        return existing
    engine = create_engine(
        trial_abuse_sqlite_url(path),
        connect_args={"check_same_thread": False},
        future=True,
    )
    TrialAbuseBase.metadata.create_all(bind=engine)
    _engines[key] = engine
    return engine


def trial_abuse_session_factory(settings: Settings):
    engine = get_trial_abuse_engine(settings)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)


def get_trial_abuse_session(settings: Settings) -> Generator[Session, None, None]:
    """FastAPI dependency style generator (caller commits)."""
    factory = trial_abuse_session_factory(settings)
    session = factory()
    try:
        yield session
    finally:
        session.close()
