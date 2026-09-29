"""Firestore to Calibrator PostgreSQL Migration Script.
Idempotently migrates legacy Calibrator data from Firebase Firestore
into the isolated 'calibrator' PostgreSQL database.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime
import json
import logging
import os
import sys
from typing import Any, Dict, List, Optional
import uuid

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv

load_dotenv()

import firebase_admin
from firebase_admin import credentials, firestore
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.calibrator_models import CalibratorJob
from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("calibrator_migration")


def resolve_calibrator_db_url() -> str:
    """Resolves the CALIBRATOR_DATABASE_URL with container/localhost adjustments."""
    url = (
        os.getenv("CALIBRATOR_DATABASE_URL")
        or getattr(settings, "calibrator_database_url", None)
        or "postgresql+asyncpg://madison_user:secure_db_password@postgres:5432/calibrator"
    )
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    # Adjust hostname for local host vs container execution
    if "postgres:5432" in url and not os.path.exists("/.dockerenv"):
        url = url.replace("postgres:5432", "localhost:5432")

    return url


def init_firebase() -> firestore.firestore.Client:
    """Initializes Firebase Admin SDK using available credentials or ADC."""
    if not firebase_admin._apps:
        # Check candidate credential paths
        candidate_paths = [
            os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
            "/home/opc/stack/secrets/adc.json",
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "secrets", "adc.json")),
            "/home/opc/stack/services/site-hunter/service-account-key.json",
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "site-hunter", "service-account-key.json")),
        ]

        cred_found = None
        for path in candidate_paths:
            if path and os.path.exists(path):
                try:
                    cred_found = path
                    # Set in env so Google client libraries detect it
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = path
                    logger.info(f"Using Google credentials from: {path}")
                    break
                except Exception as ex:
                    logger.warning(f"Error checking credentials at {path}: {ex}")

        project_id = getattr(settings, "firebase_project_id", "first-project-db-81b5e")
        os.environ["GOOGLE_CLOUD_PROJECT"] = project_id
        os.environ["GCP_PROJECT"] = project_id
        try:
            firebase_admin.initialize_app(options={"projectId": project_id})
            logger.info(f"Firebase Admin initialized for project: {project_id}")
        except Exception as e:
            logger.error(f"Failed to initialize Firebase Admin: {e}")
            raise

    return firestore.client()


def parse_float(val: Any) -> Optional[float]:
    """Safely parses float values from various raw types."""
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def parse_json_dict(val: Any) -> Optional[Dict[str, Any]]:
    """Ensures value is parsed into a clean dictionary for JSONB storage."""
    if val is None:
        return None
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, dict):
                return parsed
            return {"data": parsed}
        except Exception:
            return {"raw": val}
    return {"value": val}


def parse_timestamp(val: Any) -> Optional[datetime]:
    """Safely parses Firestore timestamps or datetime strings."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    # Firestore DatetimeWithNanoseconds
    if hasattr(val, "to_datetime"):
        return val.to_datetime()
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except Exception:
            pass
    return None


async def run_migration(dry_run: bool = False, collections: Optional[List[str]] = None) -> int:
    calibrator_url = resolve_calibrator_db_url()
    safe_log_url = calibrator_url.split("@")[-1] if "@" in calibrator_url else calibrator_url
    logger.info(f"Connecting to Calibrator PostgreSQL at: ...@{safe_log_url}")
    logger.info(f"Starting Firestore -> Calibrator migration (dry_run={dry_run})")

    engine = create_async_engine(calibrator_url, echo=False)
    session_factory = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    db = init_firebase()

    target_collections = collections or [
        "calibrator_jobs",
        "calibrations",
        "calibrator",
        "simulations",
        "simulation_jobs",
        "simulation_runs",
    ]

    total_migrated = 0

    async with session_factory() as session:
        for col_name in target_collections:
            logger.info(f"Extracting '{col_name}' collection from Firestore...")
            col_ref = db.collection(col_name)

            try:
                docs = list(col_ref.stream())
            except Exception as e:
                logger.warning(f"Could not stream collection '{col_name}': {e}")
                continue

            logger.info(f"Collection '{col_name}': found {len(docs)} documents.")

            col_migrated = 0
            for doc in docs:
                data = doc.to_dict() or {}
                doc_id = doc.id

                # Resolve UUID for the job
                raw_id = data.get("id") or doc_id
                job_uuid: uuid.UUID
                try:
                    job_uuid = uuid.UUID(str(raw_id))
                except (ValueError, TypeError):
                    job_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"calibrator_{col_name}_{doc_id}")

                # Resolve parent/linked job_id if present
                raw_job_id = data.get("job_id") or data.get("jobId")
                linked_job_uuid: Optional[uuid.UUID] = None
                if raw_job_id:
                    try:
                        linked_job_uuid = uuid.UUID(str(raw_job_id))
                    except (ValueError, TypeError):
                        pass

                # Parse configuration and nested parameter structures cleanly
                config_payload = parse_json_dict(
                    data.get("configuration") or data.get("config") or data.get("parameters")
                )
                sim_params = parse_json_dict(
                    data.get("simulation_parameters") or data.get("simulationParameters")
                )
                sim_results = parse_json_dict(
                    data.get("simulation_results") or data.get("simulationResults") or data.get("results")
                )
                equip_summary = parse_json_dict(
                    data.get("equipment_summary") or data.get("equipmentSummary")
                )
                coat_summary = parse_json_dict(
                    data.get("coating_summary") or data.get("coatingSummary")
                )

                created_at = parse_timestamp(data.get("created_at") or data.get("createdAt")) or datetime.utcnow()
                updated_at = parse_timestamp(data.get("updated_at") or data.get("updatedAt")) or datetime.utcnow()

                calibrator_job = CalibratorJob(
                    id=job_uuid,
                    job_id=linked_job_uuid,
                    name=data.get("name") or data.get("jobName") or data.get("title") or f"Calibrator Job {doc_id}",
                    status=str(data.get("status") or "pending").lower(),
                    building_type=data.get("building_type") or data.get("buildingType"),
                    climate_zone=data.get("climate_zone") or data.get("climateZone"),
                    prototype_archetype=data.get("prototype_archetype") or data.get("prototypeArchetype") or data.get("archetype"),
                    baseline_kwh=parse_float(data.get("baseline_kwh") or data.get("baselineKwh")),
                    proposed_kwh=parse_float(data.get("proposed_kwh") or data.get("proposedKwh")),
                    annual_savings_kwh=parse_float(data.get("annual_savings_kwh") or data.get("annualSavingsKwh") or data.get("savingsKwh")),
                    annual_savings_dollars=parse_float(data.get("annual_savings_dollars") or data.get("annualSavingsDollars") or data.get("savingsDollars")),
                    comfort_unmet_hours_baseline=parse_float(data.get("comfort_unmet_hours_baseline") or data.get("comfortUnmetHoursBaseline")),
                    comfort_unmet_hours_proposed=parse_float(data.get("comfort_unmet_hours_proposed") or data.get("comfortUnmetHoursProposed")),
                    configuration=config_payload,
                    equipment_summary=equip_summary,
                    coating_summary=coat_summary,
                    simulation_parameters=sim_params,
                    simulation_results=sim_results,
                    error_message=data.get("error_message") or data.get("errorMessage") or data.get("error"),
                    created_at=created_at,
                    updated_at=updated_at,
                )

                if not dry_run:
                    await session.merge(calibrator_job)

                col_migrated += 1

            if not dry_run and col_migrated > 0:
                await session.flush()

            total_migrated += col_migrated
            logger.info(f"Collection '{col_name}': successfully processed {col_migrated} records.")

        if not dry_run:
            await session.commit()
            logger.info(f"Migration completed. Total records committed: {total_migrated}")
        else:
            await session.rollback()
            logger.info(f"Dry-run completed. Total records staged (not committed): {total_migrated}")

    await engine.dispose()
    return total_migrated


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Firestore to Calibrator PostgreSQL Migration")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Run without committing changes")
    parser.add_argument("--collection", action="append", dest="collections", help="Specific collection(s) to migrate")
    args = parser.parse_args()

    count = asyncio.run(run_migration(dry_run=args.dry_run, collections=args.collections))
    print(f"MIGRATION_RESULT: {count} records migrated successfully.")
