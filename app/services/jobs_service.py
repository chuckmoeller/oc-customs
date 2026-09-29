from typing import List, Optional
import uuid
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import assert_job_in_org
from app.db_models import Device, Job, Scan
from app.schemas import JobCreate, JobUpdate


async def list_jobs(
    session: AsyncSession,
    org_id: uuid.UUID,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Job]:
    """Lists jobs scoped strictly to the organization."""
    stmt = (
        select(Job)
        .where(Job.org_id == org_id)
        .order_by(Job.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Job.client_name.ilike(term),
                Job.job_number.ilike(term),
                Job.address.ilike(term),
                Job.city.ilike(term),
            )
        )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_job_by_id(
    session: AsyncSession,
    job_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Job:
    """Retrieves a single job with its devices and billing loaded, verifying org boundary."""
    await assert_job_in_org(job_id, org_id, session)
    stmt = (
        select(Job)
        .where(Job.id == job_id, Job.org_id == org_id)
        .options(
            selectinload(Job.devices),
            selectinload(Job.billing_records),
        )
    )
    result = await session.execute(stmt)
    return result.scalars().first()


async def create_job(
    session: AsyncSession,
    data: JobCreate,
    org_id: uuid.UUID,
    user_id: Optional[str] = None,
) -> Job:
    """Creates a new job record scoped to the caller's organization."""
    job = Job(
        org_id=org_id,
        user_id=user_id,
        created_by=user_id,
        firestore_id=data.firestore_id,
        asana_project_gid=data.asana_project_gid,
        client_name=data.client_name,
        job_number=data.job_number,
        client_group=data.client_group,
        status=data.status,
        advisor=data.advisor,
        job_date=data.job_date,
        notes=data.notes,
        address=data.address,
        city=data.city,
        state=data.state,
        building_type=data.building_type,
        entity_type=data.entity_type,
        utility_name=data.utility_name,
        sqft=data.sqft,
        operating_hours_per_day=data.operating_hours_per_day,
        operating_days_per_week=data.operating_days_per_week,
        contact_name=data.contact_name,
        contact_email=data.contact_email,
        contact_phone=data.contact_phone,
    )
    session.add(job)
    await session.flush()
    return job


async def update_job(
    session: AsyncSession,
    job_id: uuid.UUID,
    org_id: uuid.UUID,
    data: JobUpdate,
) -> Job:
    """Updates mutable fields on a job within the tenant boundary."""
    job = await assert_job_in_org(job_id, org_id, session)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(job, field, value)
    await session.flush()
    return job


async def delete_job(
    session: AsyncSession,
    job_id: uuid.UUID,
    org_id: uuid.UUID,
) -> bool:
    """Deletes a job and cascades deletions to child devices, scans, and billing."""
    job = await assert_job_in_org(job_id, org_id, session)
    await session.delete(job)
    await session.flush()
    return True
