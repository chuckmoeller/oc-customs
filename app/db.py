from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


# Connection pool optimized for OCI PostgreSQL / cloud persistence
engine_kwargs = {
    "echo": settings.environment == "development" and settings.log_level == "DEBUG",
    "future": True,
}

if not settings.database_url.startswith("sqlite"):
    engine_kwargs.update(
        {
            "pool_size": settings.db_pool_size,
            "max_overflow": settings.db_max_overflow,
            "pool_recycle": settings.db_pool_recycle,
            "pool_pre_ping": settings.db_pool_pre_ping,
        }
    )

engine = create_async_engine(settings.database_url, **engine_kwargs)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for yielding an async session per request with clean rollback/commit."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# --- The Calibrator Database Setup (Re-exported from app.database) ---
from app.database import (
    CALIBRATOR_DB_URL,
    calibrator_engine,
    CalibratorSessionLocal,
    CalibratorBase,
    get_calibrator_db,
)

try:
    from app.calibrator_models import CalibratorJob
except ImportError:
    pass
