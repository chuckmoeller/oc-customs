import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Prefer SITE_HUNTER_DATABASE_URL from env, or standard site_hunter credentials
raw_url = (
    os.getenv("SITE_HUNTER_DATABASE_URL")
    or os.getenv("DATABASE_URL")
    or "postgresql://madison_user:secure_db_password@localhost:5432/site_hunter"
)

# Ensure target database is site_hunter
if "madison_stack" in raw_url:
    raw_url = raw_url.replace("madison_stack", "site_hunter")

# Strip +asyncpg for synchronous psycopg2 engine
sync_url = raw_url.replace("+asyncpg", "")

# Adjust hostname for local host vs container execution
if "postgres:5432" in sync_url and not os.path.exists("/.dockerenv"):
    sync_url = sync_url.replace("postgres:5432", "localhost:5432")

sync_engine = None
SessionLocal = None
try:
    sync_engine = create_engine(sync_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)
except Exception:
    # Synchronous DBAPI (psycopg/psycopg2) not installed in asyncpg container environments
    pass

# --- The Calibrator Database Setup ---
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base

CALIBRATOR_DB_URL = (
    os.getenv("CALIBRATOR_DATABASE_URL")
    or "postgresql+asyncpg://madison_user:secure_db_password@postgres:5432/calibrator"
)

# Adjust hostname for local host vs container execution
if "postgres:5432" in CALIBRATOR_DB_URL and not os.path.exists("/.dockerenv"):
    CALIBRATOR_DB_URL = CALIBRATOR_DB_URL.replace("postgres:5432", "localhost:5432")

calibrator_engine = create_async_engine(CALIBRATOR_DB_URL, echo=False)

CalibratorSessionLocal = sessionmaker(
    bind=calibrator_engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

CalibratorBase = declarative_base()

async def get_calibrator_db():
    async with CalibratorSessionLocal() as session:
        yield session

# Import Calibrator models so they register on CalibratorBase.metadata
try:
    from app.calibrator_models import CalibratorJob
except ImportError:
    pass
