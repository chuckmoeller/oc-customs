from typing import Any, Dict, List, Optional
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db_models import Device, Job, JobBilling
from app.schemas import DeviceReadiness, JobReadinessReport
from app.services.classify import classify_system


def audit_device_specs(device_data: Dict[str, Any], classified: Dict[str, str]) -> Dict[str, List[str]]:
    """Audits equipment device for missing fields required by the export forms.
    Faithful port of auditDeviceSpecs in site-hunter/server/services/readinessAuditor.js.
    """
    missing: List[str] = []
    warnings: List[str] = []

    def has(val: Any) -> bool:
        return val is not None and str(val).strip() != ""

    if not has(device_data.get("model_number")):
        missing.append("Model #")
    if not has(device_data.get("voltage")):
        missing.append("Voltage")

    has_capacity = (
        has(device_data.get("tonnage"))
        or has(device_data.get("btu"))
        or has(device_data.get("compressor_hp"))
    )
    if not has_capacity:
        missing.append("Capacity (Tonnage/BTU)")

    group = classified.get("group", "other")
    if group == "hvac":
        if not has(device_data.get("compressor_rla")):
            missing.append("Compressor RLA")
        if not has(device_data.get("fan_rla")) and not has(device_data.get("mca")):
            missing.append("Fan RLA or MCA")
    elif group == "cold":
        if not has(device_data.get("refrigerant_type")):
            missing.append("Refrigerant Type")

    # Warnings (non-fatal but recommended)
    if not has(device_data.get("serial_number")):
        warnings.append("Serial Number missing")
    if not has(device_data.get("manufacturer")):
        warnings.append("Manufacturer missing")
    if not has(device_data.get("mfg_year")) and not has(device_data.get("mfg_date")):
        warnings.append("Manufacture Year/Date missing")

    return {"missing": missing, "warnings": warnings}


async def audit_job_readiness(
    job_id: uuid.UUID,
    session: AsyncSession,
) -> JobReadinessReport:
    """Evaluates readiness of an entire job for submission form export."""
    stmt = (
        select(Job)
        .where(Job.id == job_id)
        .options(
            selectinload(Job.devices),
            selectinload(Job.billing_records),
        )
    )
    result = await session.execute(stmt)
    job = result.scalars().first()

    if not job:
        raise ValueError(f"Job {job_id} not found")

    device_results: List[DeviceReadiness] = []
    ready_count = 0
    job_warnings: List[str] = []

    for device in job.devices:
        dev_dict = {
            "name": device.name,
            "device_name": device.device_name,
            "category": device.category,
            "subcategory": device.subcategory,
            "equipment_type": device.equipment_type,
            "manufacturer": device.manufacturer,
            "model_number": device.model_number,
            "serial_number": device.serial_number,
            "voltage": device.voltage,
            "tonnage": device.tonnage,
            "btu": device.btu,
            "compressor_hp": device.compressor_hp,
            "compressor_rla": device.compressor_rla,
            "fan_rla": device.fan_rla,
            "mca": device.mca,
            "refrigerant_type": device.refrigerant_type,
            "mfg_year": device.mfg_year,
            "mfg_date": device.mfg_date,
        }
        classification = classify_system(dev_dict)
        audit = audit_device_specs(dev_dict, classification)

        is_ready = len(audit["missing"]) == 0
        if is_ready:
            ready_count += 1

        device_results.append(
            DeviceReadiness(
                device_id=device.id,
                device_name=device.device_name or device.name or "Unnamed Device",
                missing_fields=audit["missing"],
                warnings=audit["warnings"],
                is_ready=is_ready,
            )
        )

    billing_count = len(job.billing_records)
    has_12_months = billing_count >= 12
    if not has_12_months:
        job_warnings.append(
            f"Job has only {billing_count} monthly power bill records (12 recommended for full rebate submission)."
        )

    is_export_ready = (
        len(device_results) > 0
        and ready_count == len(device_results)
        and has_12_months
    )

    return JobReadinessReport(
        job_id=job.id,
        total_devices=len(device_results),
        ready_devices=ready_count,
        device_results=device_results,
        has_12_month_billing=has_12_months,
        billing_month_count=billing_count,
        is_export_ready=is_export_ready,
        warnings=job_warnings,
    )
