from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_auth_context
from app.db import get_session
from app.schemas import AuthContext, DeviceCreate, DeviceRead, DeviceUpdate
from app.services.devices_service import (
    create_device,
    delete_device,
    get_device_by_id,
    list_devices_for_job,
    update_device,
)

router = APIRouter(tags=["Devices"])


@router.get("/jobs/{job_id}/devices", response_model=List[DeviceRead])
async def list_devices(
    job_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    return await list_devices_for_job(session, job_id, auth.org_id)


@router.post("/devices", response_model=DeviceRead, status_code=status.HTTP_201_CREATED)
async def create_new_device(
    data: DeviceCreate,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    return await create_device(session, data, auth.org_id, user_id=auth.user_id)


@router.get("/devices/{device_id}", response_model=DeviceRead)
async def get_device(
    device_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    device = await get_device_by_id(session, device_id, auth.org_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.patch("/devices/{device_id}", response_model=DeviceRead)
async def patch_device(
    device_id: uuid.UUID,
    data: DeviceUpdate,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    device = await update_device(session, device_id, auth.org_id, data)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_device(
    device_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_session),
):
    success = await delete_device(session, device_id, auth.org_id)
    if not success:
        raise HTTPException(status_code=404, detail="Device not found")
    return None
