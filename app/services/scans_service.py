from typing import List, Optional
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db_models import Scan, SupportingPhoto
from app.schemas import ScanCreate, ScanUpdate


async def list_scans(
    session: AsyncSession,
    org_id: uuid.UUID,
    device_id: Optional[uuid.UUID] = None,
    job_number: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Scan]:
    """Lists scans filtered by organization, device, or job number."""
    stmt = (
        select(Scan)
        .where(Scan.org_id == org_id)
        .options(selectinload(Scan.supporting_photos))
        .order_by(Scan.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if device_id:
        stmt = stmt.where(Scan.device_id == device_id)
    if job_number:
        stmt = stmt.where(Scan.job_number == job_number)

    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_scan_by_id(
    session: AsyncSession,
    scan_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Optional[Scan]:
    """Fetches a single scan ensuring organization boundaries."""
    stmt = (
        select(Scan)
        .where(Scan.id == scan_id, Scan.org_id == org_id)
        .options(selectinload(Scan.supporting_photos))
    )
    result = await session.execute(stmt)
    return result.scalars().first()


async def create_scan(
    session: AsyncSession,
    data: ScanCreate,
    org_id: uuid.UUID,
    user_id: Optional[str] = None,
) -> Scan:
    """Creates a new scan record."""
    scan = Scan(
        org_id=org_id,
        user_id=user_id,
        firestore_id=data.firestore_id,
        device_id=data.device_id,
        image_url=data.image_url,
        image_path=data.image_path,
        image_bucket=data.image_bucket,
        image_size=data.image_size,
        nameplate_label=data.nameplate_label,
        analysis_provider=data.analysis_provider,
        analysis_model=data.analysis_model,
        analysis_result=data.analysis_result,
        analysis_confidence=data.analysis_confidence,
        analysis_analyzed_at=data.analysis_analyzed_at,
        job_number=data.job_number,
        equipment_type=data.equipment_type,
        location=data.location,
        status=data.status,
        tags=data.tags,
        notes=data.notes,
        taxonomy=data.taxonomy,
        photo_index=data.photo_index,
        image_hash=data.image_hash,
        sharpness_score=data.sharpness_score,
    )
    session.add(scan)
    await session.flush()

    # Eagerly reload scan with supporting_photos to ensure clean async serialization
    stmt = (
        select(Scan)
        .where(Scan.id == scan.id)
        .options(selectinload(Scan.supporting_photos))
    )
    result = await session.execute(stmt)
    return result.scalars().first()


async def update_scan(
    session: AsyncSession,
    scan_id: uuid.UUID,
    org_id: uuid.UUID,
    data: ScanUpdate,
) -> Optional[Scan]:
    """Updates scan attributes."""
    scan = await get_scan_by_id(session, scan_id, org_id)
    if not scan:
        return None

    update_dict = data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(scan, field, value)

    await session.flush()

    # Eagerly reload scan with supporting_photos to ensure clean async serialization
    stmt = (
        select(Scan)
        .where(Scan.id == scan.id)
        .options(selectinload(Scan.supporting_photos))
    )
    result = await session.execute(stmt)
    return result.scalars().first()


async def delete_scan(
    session: AsyncSession,
    scan_id: uuid.UUID,
    org_id: uuid.UUID,
) -> bool:
    """Deletes a scan and cascades deletion of supporting photos."""
    scan = await get_scan_by_id(session, scan_id, org_id)
    if not scan:
        return False
    await session.delete(scan)
    await session.flush()
    return True
