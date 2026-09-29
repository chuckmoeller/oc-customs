from typing import List, Optional
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import assert_job_in_org
from app.db_models import Device, DeviceFieldProvenance
from app.schemas import DeviceCreate, DeviceUpdate
from app.services.decoders import catch_tag, decode_capacity_from_model, decode_serial_date, decode_voltage_from_model


async def list_devices_for_job(
    session: AsyncSession,
    job_id: uuid.UUID,
    org_id: uuid.UUID,
) -> List[Device]:
    """Lists devices for a specific job within the organization."""
    await assert_job_in_org(job_id, org_id, session)
    stmt = (
        select(Device)
        .where(Device.job_id == job_id, Device.org_id == org_id)
        .options(selectinload(Device.provenance_entries))
        .order_by(Device.created_at.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_device_by_id(
    session: AsyncSession,
    device_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Optional[Device]:
    """Fetches a single device and verifies tenant boundaries."""
    stmt = (
        select(Device)
        .where(Device.id == device_id, Device.org_id == org_id)
        .options(selectinload(Device.provenance_entries))
    )
    result = await session.execute(stmt)
    return result.scalars().first()


async def create_device(
    session: AsyncSession,
    data: DeviceCreate,
    org_id: uuid.UUID,
    user_id: Optional[str] = None,
) -> Device:
    """Creates a device, runs deterministic decoders, and records provenance."""
    await assert_job_in_org(data.job_id, org_id, session)

    device_dict = data.model_dump()
    model = device_dict.get("model_number") or ""
    mfg = device_dict.get("manufacturer") or ""
    serial = device_dict.get("serial_number") or ""

    # Run TagCatcher fast-path decode
    tag_result = catch_tag(model, mfg) if model else {"matched": False}

    device = Device(
        job_id=data.job_id,
        org_id=org_id,
        user_id=user_id,
        firestore_id=data.firestore_id,
        asana_task_gid=data.asana_task_gid,
        asana_project_gid=data.asana_project_gid,
        name=data.name,
        device_name=data.device_name,
        category=data.category,
        subcategory=data.subcategory,
        subcategory_detail=data.subcategory_detail,
        equipment_type=data.equipment_type,
        manufacturer=data.manufacturer,
        model_number=data.model_number,
        serial_number=data.serial_number,
        voltage=data.voltage or tag_result.get("voltage"),
        tonnage=data.tonnage or (str(tag_result["nominal_cooling_tons"]) if tag_result.get("nominal_cooling_tons") else None),
        btu=data.btu,
        compressor_count=data.compressor_count,
        compressor_hp=data.compressor_hp,
        compressor_rla=data.compressor_rla,
        compressor_lra=data.compressor_lra,
        compressor_ph=data.compressor_ph,
        mca=data.mca,
        mocp=data.mocp,
        fan_count=data.fan_count,
        evaporator_count=data.evaporator_count,
        fan_ph=data.fan_ph or getattr(data, "fan_phases", None),
        fan_phases=getattr(data, "fan_phases", None) or data.fan_ph,
        fan_rla=data.fan_rla,
        motor_type=data.motor_type,
        aoe=data.aoe,
        quantity=data.quantity,
        mfg_year=data.mfg_year or (decode_serial_date(serial, mfg) if serial else None),
        mfg_date=data.mfg_date,
        refrigerant_type=data.refrigerant_type,
        refrigerant_charge=data.refrigerant_charge,
        weight=data.weight,
        seer=data.seer or (str(tag_result["efficiency_seer"]) if tag_result.get("efficiency_seer") else None),
        eer=data.eer,
        status=data.status,
        notes=data.notes,
        imported_from_asana=data.imported_from_asana,
        model_match_confirmed=tag_result.get("model_match_confirmed", False),
        model_match_source=tag_result.get("model_match_source"),
        ashrae_205_class=tag_result.get("ashrae_205_class"),
        matched_base_model=tag_result.get("matched_base_model"),
        tonnage_source="fast_path" if tag_result.get("matched") else None,
        tonnage_original=data.tonnage,
        requires_human_audit=tag_result.get("requires_human_audit", False),
    )
    session.add(device)
    await session.flush()

    # Record provenance entries if decoded
    if tag_result.get("matched"):
        if tag_result.get("nominal_cooling_tons"):
            prov = DeviceFieldProvenance(
                device_id=device.id,
                field_name="tonnage",
                source=tag_result.get("model_match_source", "fast_path"),
                confirmed=tag_result.get("model_match_confirmed", False),
            )
            session.add(prov)
        if tag_result.get("voltage"):
            prov_v = DeviceFieldProvenance(
                device_id=device.id,
                field_name="voltage",
                source="nomenclature_decode",
                confirmed=False,
            )
            session.add(prov_v)

    await session.flush()
    # Eagerly reload device with provenance entries to ensure clean async serialization
    stmt = (
        select(Device)
        .where(Device.id == device.id)
        .options(selectinload(Device.provenance_entries))
    )
    result = await session.execute(stmt)
    return result.scalars().first()


async def update_device(
    session: AsyncSession,
    device_id: uuid.UUID,
    org_id: uuid.UUID,
    data: DeviceUpdate,
) -> Optional[Device]:
    """Updates device attributes and flags manual overrides."""
    device = await get_device_by_id(session, device_id, org_id)
    if not device:
        return None

    update_dict = data.model_dump(exclude_unset=True)

    # Check for tonnage override
    if "tonnage" in update_dict and update_dict["tonnage"] != device.tonnage:
        device.tonnage_override = True
        device.tonnage_source = "manual_override"

    for field, value in update_dict.items():
        setattr(device, field, value)

    await session.flush()
    return device


async def delete_device(
    session: AsyncSession,
    device_id: uuid.UUID,
    org_id: uuid.UUID,
) -> bool:
    """Deletes device and cascades to provenance and scan unlinking."""
    device = await get_device_by_id(session, device_id, org_id)
    if not device:
        return False
    await session.delete(device)
    await session.flush()
    return True
