"""Runtime configuration loaded from environment / .env."""
from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://flori:flori@localhost:5432/flori_scouting"
    secret_key: str = "dev-insecure-secret-change-me"
    access_token_expire_minutes: int = 720
    algorithm: str = "HS256"
    # NoDecode: let the comma-splitting validator own parsing (env or .env).
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]
    seed_on_startup: bool = True
    # Legacy FloriSynergy API — source of the master chemical list (with real
    # buying prices). Set FLORI_API_KEY in .env; never commit the key.
    flori_api_url: str = "https://ipr.thinksynergyltd.com/api1/rest/getchemicals.php"
    flori_api_key: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
