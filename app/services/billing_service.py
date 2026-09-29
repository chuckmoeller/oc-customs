import re
from typing import Any, Dict, List, Optional
import uuid
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db_models import JobBilling


def sanitize_billing_record(r: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitizes billing line item to fix VLM extraction artifacts.
    Port of sanitizeBillingRecord from server/routes/export.js.
    """
    if not r:
        return r

    service = float(r.get("service_charge") or 0.0)
    energy = float(r.get("energy_charge") or 0.0)
    demand = float(r.get("demand_charge") or 0.0)
    taxes = float(r.get("taxes") or 0.0)
    total = float(r.get("total_amount") or 0.0)

    # Fix 1: service_charge ≈ energy_charge -> double-counted energy charge; zero service_charge
    if service > 0 and energy > 0:
        ratio = service / energy
        if 0.8 < ratio < 1.2:
            r["service_charge"] = 0.0
            service = 0.0

    # Fix 2: Large service charge with absent energy charge -> mis-filed
    if service > 500.0 and energy == 0.0:
        r["energy_charge"] = service
        r["service_charge"] = 0.0
        energy = service
        service = 0.0

    # Fix 3: components sum > total_amount * 1.05 -> over-counting somewhere
    if total > 0.0:
        computed = service + energy + demand + taxes
        if computed > total * 1.05:
            r["service_charge"] = 0.0

    return r


def account_number_from_filename(filename: str) -> Optional[str]:
    """Extracts fallback account number digits from bill filename."""
    if not filename:
        return None
    runs = re.findall(r"\d{3,}", filename)
    if not runs:
        return None
    last = runs[-1]
    # Skip if looks like a bare year
    if len(runs) == 1 and len(last) == 4 and 2015 <= int(last) <= 2035:
        return None
    return last


def normalize_account_key(account_number: Optional[str]) -> str:
    """Normalizes account number for idempotent grouping."""
    if not account_number:
        return "__default__"
    return re.sub(r"[^a-zA-Z0-9]", "", str(account_number)).lower()


async def save_or_update_billing(
    session: AsyncSession,
    billing_data: List[Dict[str, Any]],
    job_id: uuid.UUID,
    org_id: uuid.UUID,
) -> int:
    """Idempotently saves or updates billing records for a job."""
    count = 0
    for item in billing_data:
        sanitized = sanitize_billing_record(dict(item))
        acct = sanitized.get("account_number") or ""
        month = sanitized.get("month") or ""
        year = int(sanitized.get("year") or 0)

        if not month or not year:
            continue

        stmt = select(JobBilling).where(
            JobBilling.job_id == job_id,
            JobBilling.account_number == acct,
            JobBilling.year == year,
            JobBilling.month == month,
        )
        res = await session.execute(stmt)
        existing = res.scalars().first()

        if existing:
            for k, v in sanitized.items():
                if hasattr(existing, k) and k not in ("id", "job_id", "org_id", "imported_at"):
                    setattr(existing, k, v)
        else:
            record = JobBilling(
                job_id=job_id,
                org_id=org_id,
                account_number=acct,
                month=month,
                year=year,
                kwh_usage=sanitized.get("kwh_usage"),
                demand_kw=sanitized.get("demand_kw"),
                service_charge=sanitized.get("service_charge"),
                energy_charge=sanitized.get("energy_charge"),
                demand_charge=sanitized.get("demand_charge"),
                taxes=sanitized.get("taxes"),
                total_amount=sanitized.get("total_amount"),
                utility_name=sanitized.get("utility_name"),
                canonical_utility=sanitized.get("canonical_utility"),
                canonical_state=sanitized.get("canonical_state"),
                days_in_period=sanitized.get("days_in_period"),
                source_asset_id=sanitized.get("source_asset_id"),
                source_filename=sanitized.get("source_filename"),
            )
            session.add(record)
        count += 1

    return count
