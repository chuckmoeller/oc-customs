import os
from sqlalchemy import Column, String, DateTime, JSON, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import sqlite3

# Use SQLite for Cloud Run (no external DB needed)
DB_PATH = os.getenv("DB_PATH", "/tmp/automation_hub.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
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

def init_db():
    Base.metadata.create_all(bind=engine)

async def get_db_pool():
    return engine

async def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Initialize DB on import
init_db()
