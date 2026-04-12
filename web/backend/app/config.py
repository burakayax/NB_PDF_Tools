"""Ortam degiskenleri: Node SaaS API ile ayni JWT sirri ve SQLite veritabani."""

from __future__ import annotations

from funcTOOLS import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_sqlite_path() -> Path:
    """web/backend'den api/prisma/dev.db varsayilan yolu."""
    return (Path(__file__).resolve().parent.parent.parent / "api" / "prisma" / "dev.db").resolve()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    jwt_access_secret: str = Field(min_length=32, description="Node ile ayni JWT_ACCESS_SECRET")
    sqlite_db_path: Path | None = Field(default=None, description="SQLITE_DB_PATH")
    database_url: str | None = Field(default=None, description="Prisma DATABASE_URL (file:...)")

    #: HMAC key for hashing IPs, device ids, identity keys, and email verification tokens (env: TRIAL_ABUSE_HMAC_SECRET).
    trial_abuse_hmac_secret: str = Field(
        default="DEV_ONLY_TRIAL_ABUSE_HMAC_SECRET_CHANGE_IN_PRODUCTION_32+",
        min_length=32,
    )
    trial_abuse_sqlite_path: Path | None = Field(
        default=None,
        description="Dedicated SQLite for trial abuse tables (default: web/backend/data/trial_abuse.sqlite)",
    )
    #: Registrations with same hashed IP within this window count toward soft cap.
    trial_abuse_ip_window_hours: int = Field(default=24, ge=1, le=168)
    trial_abuse_max_regs_per_ip_window: int = Field(default=5, ge=1, le=100)

    @field_validator("sqlite_db_path", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: object) -> object:
        if v == "":
            return None
        return v

    def resolved_sqlite_path(self) -> Path:
        if self.sqlite_db_path is not None:
            return Path(self.sqlite_db_path).expanduser().resolve()
        if self.database_url and self.database_url.strip().startswith("file:"):
            raw = self.database_url.strip()[5:].split("?")[0]
            if raw.startswith("//"):
                raw = raw[2:]
            p = Path(raw)
            if not p.is_absolute():
                p = (Path.cwd() / p).resolve()
            return p
        return _default_sqlite_path()

    def resolved_trial_abuse_sqlite_path(self) -> Path:
        if self.trial_abuse_sqlite_path is not None:
            return Path(self.trial_abuse_sqlite_path).expanduser().resolve()
        backend_root = Path(__file__).resolve().parent.parent
        data_dir = backend_root / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        return (data_dir / "trial_abuse.sqlite").resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
