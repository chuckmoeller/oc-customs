import uuid
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.calibrator_models import CalibratorJob
from app.db import get_calibrator_db
from app.services.calibrator_sync import handle_project_sync_request, publish_project_sync_event

router = APIRouter(prefix="/api/calibrator", tags=["calibrator"])


class JobCreate(BaseModel):
    name: str
    configuration: Optional[dict] = None
    job_id: Optional[uuid.UUID] = None
    building_type: Optional[str] = None
    climate_zone: Optional[str] = None
    prototype_archetype: Optional[str] = None
    simulation_parameters: Optional[dict] = None


class ProjectSyncRequest(BaseModel):
    project_id: Optional[str] = None
    job_id: Optional[str] = None
    stream: Optional[bool] = False
    metadata: Optional[dict] = None


@router.post("/jobs", status_code=status.HTTP_201_CREATED)
async def create_job(job: JobCreate, db: AsyncSession = Depends(get_calibrator_db)):
    """Create and persist a new Calibrator job in the isolated calibrator database."""
    new_job = CalibratorJob(
        name=job.name,
        configuration=job.configuration,
        job_id=job.job_id,
        building_type=job.building_type,
        climate_zone=job.climate_zone,
        prototype_archetype=job.prototype_archetype,
        simulation_parameters=job.simulation_parameters or job.configuration,
    )
    db.add(new_job)
    await db.commit()
    await db.refresh(new_job)
    return new_job


@router.get("/jobs")
async def list_jobs(db: AsyncSession = Depends(get_calibrator_db)):
    """List all simulation jobs recorded in The Calibrator database."""
    result = await db.execute(select(CalibratorJob).order_by(CalibratorJob.created_at.desc()))
    return result.scalars().all()


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, db: AsyncSession = Depends(get_calibrator_db)):
    """Retrieve details of a specific Calibrator simulation job."""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job UUID format")

    result = await db.execute(select(CalibratorJob).where(CalibratorJob.id == job_uuid))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Calibrator job not found")
    return job


# -----------------------------------------------------------------------------
# Dedicated Project Sync Endpoints (events:calibrator)
# -----------------------------------------------------------------------------
@router.post("/sync/{project_id}")
async def trigger_project_sync_by_id(project_id: str, request: Request):
    """Publish a project_sync event to events:calibrator stream with SSE or JSON output."""
    return await handle_project_sync_request(project_id, request=request)


@router.post("/sync")
async def trigger_project_sync_body(request: Request):
    """Publish a project_sync event from body or query parameters."""
    project_id = request.query_params.get("project_id") or request.query_params.get("job_id")
    extra = {}
    try:
        body = await request.json()
        if isinstance(body, dict):
            project_id = body.get("project_id") or body.get("job_id") or project_id
            extra = body
    except Exception:
        pass

    if not project_id:
        raise HTTPException(status_code=400, detail="Missing project_id or job_id in request")

    return await handle_project_sync_request(project_id, request=request, extra=extra)


# Direct alias router without /api prefix
calibrator_direct_router = APIRouter(prefix="/calibrator", tags=["calibrator"])
calibrator_direct_router.add_api_route("/jobs", create_job, methods=["POST"], status_code=status.HTTP_201_CREATED)
calibrator_direct_router.add_api_route("/jobs", list_jobs, methods=["GET"])
calibrator_direct_router.add_api_route("/jobs/{job_id}", get_job, methods=["GET"])
calibrator_direct_router.add_api_route("/sync/{project_id}", trigger_project_sync_by_id, methods=["POST"])
calibrator_direct_router.add_api_route("/sync", trigger_project_sync_body, methods=["POST"])
