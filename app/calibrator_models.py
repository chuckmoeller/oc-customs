from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    DateTime,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import CalibratorBase


class CalibratorJob(CalibratorBase):
    __tablename__ = "calibrator_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PgUUID(as_uuid=True), nullable=True, index=True
    )
    name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False, index=True)
    building_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    climate_zone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    prototype_archetype: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    baseline_kwh: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    proposed_kwh: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    annual_savings_kwh: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    annual_savings_dollars: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    comfort_unmet_hours_baseline: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    comfort_unmet_hours_proposed: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)

    configuration: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    equipment_summary: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    coating_summary: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    simulation_parameters: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    simulation_results: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
