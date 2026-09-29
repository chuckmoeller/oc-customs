import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON, TypeDecorator

from app.db import Base


# Cross-dialect JSON/JSONB and Array support for clean testing
class JSONBType(TypeDecorator):
    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())


class StringArrayType(TypeDecorator):
    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(ARRAY(String))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value, dialect):
        if dialect.name == "sqlite" and value is not None:
            return list(value)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return []
        return list(value)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    memberships: Mapped[List["Membership"]] = relationship(
        "Membership", back_populates="organization", cascade="all, delete-orphan"
    )


class Membership(Base):
    __tablename__ = "memberships"

    uid: Mapped[str] = mapped_column(Text, primary_key=True)  # Firebase UID
    org_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(Text, default="member", nullable=False)
    email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    display_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    auth_provider: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    status: Mapped[str] = mapped_column(Text, default="active", nullable=False)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="memberships")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, nullable=False, index=True
    )
    firestore_id: Mapped[Optional[str]] = mapped_column(
        String(64), unique=True, nullable=True, index=True
    )
    user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    client_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    job_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    client_group: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="Start Here", nullable=False)
    advisor: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    job_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    device_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    scan_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Site / Facility Attributes
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    building_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    entity_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    utility_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sqft: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    operating_hours_per_day: Mapped[Optional[float]] = mapped_column(
        Numeric(4, 2), nullable=True
    )
    operating_days_per_week: Mapped[Optional[float]] = mapped_column(
        Numeric(3, 1), nullable=True
    )
    contact_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Asana Integration
    asana_project_gid: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )
    asana_synced: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    asana_last_synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Billing Summary
    billing_utility_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    billing_account_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    billing_month_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    billing_last_imported_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    devices: Mapped[List["Device"]] = relationship(
        "Device", back_populates="job", cascade="all, delete-orphan", lazy="selectin"
    )
    billing_records: Mapped[List["JobBilling"]] = relationship(
        "JobBilling", back_populates="job", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def name(self) -> Optional[str]:
        return self.client_name

    @name.setter
    def name(self, value: Optional[str]):
        self.client_name = value

    @property
    def scans(self) -> List[Any]:
        if hasattr(self, "_scans"):
            return self._scans
        result = []
        for d in (self.devices or []):
            if hasattr(d, "scans") and d.scans:
                result.extend(d.scans)
        return result

    @scans.setter
    def scans(self, value: List[Any]):
        self._scans = value


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, nullable=False, index=True
    )
    firestore_id: Mapped[Optional[str]] = mapped_column(
        String(64), unique=True, nullable=True, index=True
    )
    user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Nomenclature & Core Specs
    name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    device_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subcategory: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subcategory_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    equipment_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    manufacturer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    serial_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    voltage: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tonnage: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Electrical & Mechanical Details
    compressor_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    compressor_hp: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    compressor_hp_estimated: Mapped[bool] = mapped_column(Boolean, default=False)
    compressor_rla: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    compressor_rla_estimated: Mapped[bool] = mapped_column(Boolean, default=False)
    compressor_lra: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    compressor_ph: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mca: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mocp: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fan_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    evaporator_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fan_ph: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fan_phases: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fan_rla: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fan_fla: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fan_hp: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    motor_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    aoe: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    mfg_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mfg_date: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    refrigerant_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    refrigerant_charge: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    weight: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    seer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    eer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    iplv: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cop: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    oil_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    oil_charge: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    design_pressure_high: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    design_pressure_low: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ahri_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    btu: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(Text, default="Start Here", nullable=False)
    advisor: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    device_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    imported_from_asana: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Asana Integration
    asana_project_gid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    asana_task_gid: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )
    asana_synced: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    asana_last_synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Enrichment Tracking
    enrichment_missing_fields: Mapped[List[str]] = mapped_column(
        StringArrayType, default=list, nullable=False
    )
    enrichment_last_attempt: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    enrichment_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    enrichment_grounding_failed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    enrichment_reocr_done: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # TagCatcher Provenance
    model_match_confirmed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    model_match_source: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ashrae_205_class: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    matched_base_model: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tonnage_source: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tonnage_original: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tonnage_override: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    requires_human_audit: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    job: Mapped["Job"] = relationship("Job", back_populates="devices")
    provenance_entries: Mapped[List["DeviceFieldProvenance"]] = relationship(
        "DeviceFieldProvenance", back_populates="device", cascade="all, delete-orphan", lazy="selectin"
    )
    scans: Mapped[List["Scan"]] = relationship(
        "Scan", back_populates="device"
    )


class DeviceFieldProvenance(Base):
    __tablename__ = "device_field_provenance"

    device_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("devices.id", ondelete="CASCADE"),
        primary_key=True,
    )
    field_name: Mapped[str] = mapped_column(Text, primary_key=True)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    decoded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    device: Mapped["Device"] = relationship("Device", back_populates="provenance_entries")


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, nullable=False, index=True
    )
    firestore_id: Mapped[Optional[str]] = mapped_column(
        String(64), unique=True, nullable=True, index=True
    )
    user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_bucket: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    nameplate_label: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    analysis_provider: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    analysis_model: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    analysis_result: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONBType, nullable=True
    )
    analysis_confidence: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 4), nullable=True
    )
    analysis_analyzed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    job_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    equipment_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    asana_synced: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    asana_synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    asana_story_gid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    asana_task_gid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    asana_project_gid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    status: Mapped[str] = mapped_column(Text, default="pending", nullable=False)
    tags: Mapped[List[str]] = mapped_column(StringArrayType, default=list, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    taxonomy: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    image_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )
    sharpness_score: Mapped[Optional[float]] = mapped_column(
        Numeric(6, 3), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    device: Mapped[Optional["Device"]] = relationship("Device", back_populates="scans")
    supporting_photos: Mapped[List["SupportingPhoto"]] = relationship(
        "SupportingPhoto", back_populates="scan", cascade="all, delete-orphan", lazy="selectin"
    )


class SupportingPhoto(Base):
    __tablename__ = "supporting_photos"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    scan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("scans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    scan: Mapped["Scan"] = relationship("Scan", back_populates="supporting_photos")


class JobBilling(Base):
    __tablename__ = "job_billing"
    __table_args__ = (
        UniqueConstraint(
            "job_id", "account_number", "year", "month", name="uq_job_billing_account_period"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, nullable=False, index=True
    )
    account_number: Mapped[str] = mapped_column(Text, default="", nullable=False)
    month: Mapped[str] = mapped_column(Text, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    kwh_usage: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    demand_kw: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    service_charge: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    energy_charge: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    demand_charge: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    taxes: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    total_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    utility_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    canonical_utility: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    canonical_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    days_in_period: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_asset_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    source_filename: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    job: Mapped["Job"] = relationship("Job", back_populates="billing_records")


class Utility(Base):
    __tablename__ = "utilities"

    state: Mapped[str] = mapped_column(String(2), primary_key=True)
    name: Mapped[str] = mapped_column(Text, primary_key=True)


class SpecCache(Base):
    __tablename__ = "spec_cache"

    cache_key: Mapped[str] = mapped_column(Text, primary_key=True)
    manufacturer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fields: Mapped[Dict[str, Any]] = mapped_column(JSONBType, default=dict, nullable=False)
    sources: Mapped[List[Any]] = mapped_column(JSONBType, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ImageCache(Base):
    __tablename__ = "image_cache"

    image_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSONBType, default=dict, nullable=False)
    category: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subcategory: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    manufacturer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
