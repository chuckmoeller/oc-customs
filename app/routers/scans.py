from typing import List, Optional
import uuid
from fastapi import Request, APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_auth_context
from app.db import get_session
from app.schemas import AuthContext, ScanCreate, ScanRead, ScanUpdate
from app.services.scans_service import (
    create_scan,
    delete_scan,
    get_scan_by_id,
    list_scans,
    update_scan,
)

router = APIRouter(prefix="/scans", tags=["Scans"])


@router.get("", response_model=List[ScanRead])
async def get_scans(
    device_id: Optional[uuid.UUID] = Query(None),
    job_number: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    return await list_scans(
        session,
        auth.org_id,
        device_id=device_id,
        job_number=job_number,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=ScanRead, status_code=status.HTTP_201_CREATED)
async def create_new_scan(
    data: ScanCreate,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    return await create_scan(session, data, auth.org_id, user_id=auth.user_id)


@router.post("/analyze")
@router.post("/analyze/")
async def analyze_scan_post(request: Request):
    """Analyze scan image for equipment details."""
    import sys
    server_mod = sys.modules.get("server") or sys.modules.get("app")
    if server_mod and hasattr(server_mod, "analyze_equipment"):
        return await server_mod.analyze_equipment(request)
    raise HTTPException(status_code=500, detail="Analyzer service not registered")


@router.get("/{scan_id}", response_model=ScanRead)
async def get_scan(
    scan_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    scan = await get_scan_by_id(session, scan_id, auth.org_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.patch("/{scan_id}", response_model=ScanRead)
async def patch_scan(
    scan_id: uuid.UUID,
    data: ScanUpdate,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    scan = await update_scan(session, scan_id, auth.org_id, data)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_scan(
    scan_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    success = await delete_scan(session, scan_id, auth.org_id)
    if not success:
        raise HTTPException(status_code=404, detail="Scan not found")
    return None
