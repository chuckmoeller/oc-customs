from typing import List, Optional
import uuid
from fastapi import Request, APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_auth_context
from app.db import get_session
from app.schemas import (
    AuthContext,
    JobCreate,
    JobDetailRead,
    JobRead,
    JobReadinessReport,
    JobUpdate,
)
from app.services.jobs_service import (
    create_job,
    delete_job,
    get_job_by_id,
    list_jobs,
    update_job,
)
from app.services.readiness import audit_job_readiness

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.get("", response_model=List[JobRead])
async def get_jobs_list(
    search: Optional[str] = Query(None, description="Search by client, job #, or address"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    return await list_jobs(session, auth.org_id, search=search, limit=limit, offset=offset)


@router.post("", response_model=JobRead, status_code=status.HTTP_201_CREATED)
async def create_new_job(
    data: JobCreate,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    return await create_job(session, data, auth.org_id, user_id=auth.user_id)


@router.get("/{job_id}", response_model=JobDetailRead)
async def get_job_detail(
    job_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    job = await get_job_by_id(session, job_id, auth.org_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.patch("/{job_id}", response_model=JobRead)
async def patch_job(
    job_id: uuid.UUID,
    data: JobUpdate,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    return await update_job(session, job_id, auth.org_id, data)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_job(
    job_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    await delete_job(session, job_id, auth.org_id)
    return None


@router.get("/{job_id}/readiness", response_model=JobReadinessReport)
async def get_job_readiness(
    job_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    # Verify tenant ownership first
    await get_job_by_id(session, job_id, auth.org_id)
    return await audit_job_readiness(job_id, session)


@router.post("/{job_id}/sync")
async def trigger_job_sync_route(job_id: uuid.UUID, request: Request):
    """Publish a project_sync event for the job to events:calibrator Redis stream."""
    from app.services.calibrator_sync import handle_project_sync_request
    return await handle_project_sync_request(str(job_id), request=request)
