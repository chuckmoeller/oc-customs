import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import Column, String, DateTime, JSON, Text, select
from sqlalchemy.orm import declarative_base
from datetime import datetime

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://madison_user:secure_db_password@postgres:5432/automation_hub"
)

engine = None
async_session = None
Base = declarative_base()

class Workflow(Base):
    __tablename__ = "workflows"

    workflow_id = Column(String, primary_key=True)
    workflow_name = Column(String, nullable=False)
    status = Column(String, default="pending")
    context = Column(JSON, nullable=True)
    results = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

async def init_db():
    global engine, async_session
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db_pool():
    if engine is None:
        await init_db()
    return engine

async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
