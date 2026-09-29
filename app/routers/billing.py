from typing import Any, Dict, List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import assert_job_in_org, get_auth_context
from app.db import get_session
from app.db_models import JobBilling
from app.schemas import AuthContext, JobBillingRead
from app.services.billing_service import save_or_update_billing

router = APIRouter(tags=["Billing"])


@router.get("/jobs/{job_id}/billing", response_model=List[JobBillingRead])
async def get_billing_for_job(
    job_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    await assert_job_in_org(job_id, auth.org_id, session)
    stmt = (
        select(JobBilling)
        .where(JobBilling.job_id == job_id, JobBilling.org_id == auth.org_id)
        .order_by(JobBilling.year.asc(), JobBilling.month.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("/jobs/{job_id}/billing/import", status_code=status.HTTP_200_OK)
async def import_job_billing(
    job_id: uuid.UUID,
    records: List[Dict[str, Any]],
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    await assert_job_in_org(job_id, auth.org_id, session)
    imported = await save_or_update_billing(session, records, job_id, auth.org_id)
    return {
        "status": "success",
        "job_id": str(job_id),
        "imported_records": imported,
    }
