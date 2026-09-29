import os
from typing import Any, List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database: Oracle Cloud Infrastructure PostgreSQL
    database_url: str = "postgresql+asyncpg://madison_user:secure_db_password@postgres:5432/site_hunter"
    calibrator_database_url: str = "postgresql+asyncpg://madison_user:secure_db_password@postgres:5432/calibrator"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_recycle: int = 1800
    db_pool_pre_ping: bool = True

    # Security & CORS
    allowed_origins: Union[str, List[str]] = [
        "https://disco.site-hunter.com",
        "https://api.site-hunter.com",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
        "https://site-hunter-kw6upids4a-uc.a.run.app",
    ]
    firebase_project_id: str = "first-project-db-81b5e"

    # Storage
    storage_dir: str = "storage"

    # Environment
    environment: str = "development"
    log_level: str = "INFO"
    port: int = 8080

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return []

    @field_validator("database_url", mode="before")
    @classmethod
    def resolve_site_hunter_db(cls, v: Any) -> str:
        url = os.getenv("SITE_HUNTER_DATABASE_URL") or v or ""
        if isinstance(url, str):
            if "madison_stack" in url:
                url = url.replace("madison_stack", "site_hunter")
            if url.startswith("postgresql://"):
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @field_validator("calibrator_database_url", mode="before")
    @classmethod
    def resolve_calibrator_db(cls, v: Any) -> str:
        url = os.getenv("CALIBRATOR_DATABASE_URL") or v or ""
        if isinstance(url, str) and url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


settings = Settings()
