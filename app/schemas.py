import uuid
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class JobStatus(str, Enum):
    START_HERE = "Start Here"
    WORKING_ON_IT = "Working On It"
    STUCK = "Stuck"
    READY_FOR_PROPOSAL = "Ready For Proposal"
    REQUIRED_FOR_BLUEPRINT = "Required For Blueprint"
    COMPLETE = "Complete"
    CLOSED = "Closed"


class PhotoTaxonomy(str, Enum):
    NAMEPLATE = "nameplate"
    OVERVIEW = "overview"
    ELECTRICAL = "electrical"
    MECHANICAL = "mechanical"


class ModelMatchSource(str, Enum):
    FAST_PATH = "fast_path"
    GROUNDING = "grounding"
    SPEC_CACHE = "spec_cache"
    AHRI = "ahri"
    ENERGY_STAR = "energy_star"
    MANUAL = "manual"


class MembershipRole(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


# Auth context injected from JWT token
class AuthContext(BaseModel):
    user_id: str
    org_id: uuid.UUID
    email: Optional[str] = None
    role: str = "member"


# ─── Organizations ───────────────────────────────────────────

class OrganizationBase(BaseModel):
    name: str


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationRead(OrganizationBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    created_by: Optional[str] = None


# ─── Memberships ─────────────────────────────────────────────

class MembershipBase(BaseModel):
    email: Optional[str] = None
    display_name: Optional[str] = None
    photo_url: Optional[str] = None
    auth_provider: Optional[str] = None
    role: str = "member"
    status: str = "active"


class MembershipCreate(MembershipBase):
    uid: str
    org_id: uuid.UUID


class MembershipRead(MembershipBase):
    model_config = ConfigDict(from_attributes=True)

    uid: str
    org_id: uuid.UUID
    joined_at: datetime


# ─── Supporting Photos ────────────────────────────────────────

class SupportingPhotoBase(BaseModel):
    label: Optional[str] = None
    url: str
    path: Optional[str] = None
    size: Optional[int] = None
    sort_order: int = 0


class SupportingPhotoCreate(SupportingPhotoBase):
    pass


class SupportingPhotoRead(SupportingPhotoBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scan_id: uuid.UUID


# ─── Provenance ───────────────────────────────────────────────

class DeviceFieldProvenanceBase(BaseModel):
    field_name: str
    source: str
    confirmed: bool = False


class DeviceFieldProvenanceCreate(DeviceFieldProvenanceBase):
    device_id: uuid.UUID


class DeviceFieldProvenanceRead(DeviceFieldProvenanceBase):
    model_config = ConfigDict(from_attributes=True)

    device_id: uuid.UUID
    decoded_at: datetime


# ─── Devices ──────────────────────────────────────────────────

class DeviceBase(BaseModel):
    name: Optional[str] = None
    device_name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    subcategory_detail: Optional[str] = None
    equipment_type: Optional[str] = None
    manufacturer: Optional[str] = None
    model_number: Optional[str] = None
    serial_number: Optional[str] = None
    voltage: Optional[str] = None
    tonnage: Optional[str] = None
    btu: Optional[str] = None
    compressor_count: Optional[int] = None
    compressor_hp: Optional[str] = None
    compressor_hp_estimated: bool = False
    compressor_rla: Optional[str] = None
    compressor_rla_estimated: bool = False
    compressor_lra: Optional[str] = None
    compressor_ph: Optional[str] = None
    mca: Optional[str] = None
    mocp: Optional[str] = None
    fan_count: Optional[int] = None
    evaporator_count: Optional[int] = None
    fan_ph: Optional[str] = None
    fan_phases: Optional[str] = None
    fan_rla: Optional[str] = None
    fan_fla: Optional[str] = None
    fan_hp: Optional[str] = None
    motor_type: Optional[str] = None
    aoe: Optional[str] = None
    quantity: int = 1
    mfg_year: Optional[int] = None
    mfg_date: Optional[str] = None
    refrigerant_type: Optional[str] = None
    refrigerant_charge: Optional[str] = None
    weight: Optional[str] = None
    seer: Optional[str] = None
    eer: Optional[str] = None
    iplv: Optional[str] = None
    cop: Optional[str] = None
    oil_type: Optional[str] = None
    oil_charge: Optional[str] = None
    design_pressure_high: Optional[str] = None
    design_pressure_low: Optional[str] = None
    ahri_number: Optional[str] = None
    status: str = "Start Here"
    advisor: Optional[str] = None
    device_date: Optional[date] = None
    notes: Optional[str] = None
    imported_from_asana: bool = False

    @model_validator(mode="before")
    @classmethod
    def sync_fan_phases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            val = data.get("fan_phases") or data.get("fan_ph") or data.get("compressor_ph")
            if (val is None or str(val).strip() == "") and data.get("voltage"):
                v_str = str(data.get("voltage"))
                if any(x in v_str for x in ["460", "575", "480", "/3", "3ph"]):
                    val = "3"
                elif any(x in v_str for x in ["115", "/1", "1ph"]):
                    val = "1"
            if val is not None and str(val).strip() != "":
                c_val = "1" if "1" in str(val) else ("3" if "3" in str(val) else str(val).strip())
                data["fan_phases"] = c_val
                data["fan_ph"] = c_val
        return data


class DeviceCreate(DeviceBase):
    job_id: uuid.UUID
    firestore_id: Optional[str] = None
    asana_task_gid: Optional[str] = None
    asana_project_gid: Optional[str] = None


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    device_name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    subcategory_detail: Optional[str] = None
    equipment_type: Optional[str] = None
    manufacturer: Optional[str] = None
    model_number: Optional[str] = None
    serial_number: Optional[str] = None
    voltage: Optional[str] = None
    tonnage: Optional[str] = None
    btu: Optional[str] = None
    compressor_count: Optional[int] = None
    compressor_hp: Optional[str] = None
    compressor_rla: Optional[str] = None
    compressor_lra: Optional[str] = None
    compressor_ph: Optional[str] = None
    mca: Optional[str] = None
    mocp: Optional[str] = None
    fan_count: Optional[int] = None
    evaporator_count: Optional[int] = None
    fan_ph: Optional[str] = None
    fan_phases: Optional[str] = None
    fan_rla: Optional[str] = None
    quantity: Optional[int] = None
    mfg_year: Optional[int] = None
    mfg_date: Optional[str] = None
    refrigerant_type: Optional[str] = None
    refrigerant_charge: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    model_match_confirmed: Optional[bool] = None
    model_match_source: Optional[str] = None
    ashrae_205_class: Optional[str] = None
    tonnage_source: Optional[str] = None
    tonnage_override: Optional[bool] = None
    requires_human_audit: Optional[bool] = None

    @model_validator(mode="before")
    @classmethod
    def sync_fan_phases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            val = data.get("fan_phases") or data.get("fan_ph") or data.get("compressor_ph")
            if (val is None or str(val).strip() == "") and data.get("voltage"):
                v_str = str(data.get("voltage"))
                if any(x in v_str for x in ["460", "575", "480", "/3", "3ph"]):
                    val = "3"
                elif any(x in v_str for x in ["115", "/1", "1ph"]):
                    val = "1"
            if val is not None and str(val).strip() != "":
                c_val = "1" if "1" in str(val) else ("3" if "3" in str(val) else str(val).strip())
                data["fan_phases"] = c_val
                data["fan_ph"] = c_val
        return data


class DeviceRead(DeviceBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    org_id: uuid.UUID
    firestore_id: Optional[str] = None
    asana_task_gid: Optional[str] = None
    asana_project_gid: Optional[str] = None
    asana_synced: bool
    asana_last_synced_at: Optional[datetime] = None
    enrichment_missing_fields: List[str] = []
    enrichment_attempts: int = 0
    enrichment_grounding_failed: bool = False
    model_match_confirmed: bool = False
    model_match_source: Optional[str] = None
    ashrae_205_class: Optional[str] = None
    matched_base_model: Optional[str] = None
    tonnage_source: Optional[str] = None
    tonnage_original: Optional[str] = None
    tonnage_override: bool = False
    requires_human_audit: bool = False
    created_at: datetime
    updated_at: datetime
    provenance_entries: List[DeviceFieldProvenanceRead] = []


# ─── Scans ───────────────────────────────────────────────────

class ScanBase(BaseModel):
    device_id: Optional[uuid.UUID] = None
    image_url: Optional[str] = None
    image_path: Optional[str] = None
    image_bucket: Optional[str] = None
    image_size: Optional[int] = None
    nameplate_label: Optional[str] = None
    analysis_provider: Optional[str] = None
    analysis_model: Optional[str] = None
    analysis_result: Optional[Dict[str, Any]] = None
    analysis_confidence: Optional[float] = None
    analysis_analyzed_at: Optional[datetime] = None
    job_number: Optional[str] = None
    equipment_type: Optional[str] = None
    location: Optional[str] = None
    status: str = "pending"
    tags: List[str] = []
    notes: Optional[str] = None
    taxonomy: Optional[str] = "nameplate"
    photo_index: int = 0
    image_hash: Optional[str] = None
    sharpness_score: Optional[float] = None
    fan_phases: Optional[str] = None
    fan_ph: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def capture_scan_fan_phases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            ar = data.get("analysis_result") if isinstance(data.get("analysis_result"), dict) else {}
            val = data.get("fan_phases") or data.get("fan_ph") or ar.get("fan_phases") or ar.get("fan_ph")
            if not val or str(val).strip() == "":
                val = ar.get("phase") or ar.get("compressor_ph") or data.get("compressor_ph")
            if not val or str(val).strip() == "":
                v_str = str(ar.get("voltage") or data.get("voltage") or "")
                if any(x in v_str for x in ["460", "575", "480", "/3", "3ph"]):
                    val = "3"
                elif any(x in v_str for x in ["115", "/1", "1ph"]):
                    val = "1"
            if val is not None and str(val).strip() != "":
                c_val = "1" if "1" in str(val) else ("3" if "3" in str(val) else str(val).strip())
                data["fan_phases"] = c_val
                data["fan_ph"] = c_val
                if isinstance(data.get("analysis_result"), dict):
                    data["analysis_result"]["fan_phases"] = c_val
                    data["analysis_result"]["fan_ph"] = c_val
        return data


class ScanCreate(ScanBase):
    firestore_id: Optional[str] = None


class ScanUpdate(BaseModel):
    device_id: Optional[uuid.UUID] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    nameplate_label: Optional[str] = None
    analysis_result: Optional[Dict[str, Any]] = None
    analysis_confidence: Optional[float] = None
    taxonomy: Optional[str] = None
    fan_phases: Optional[str] = None
    fan_ph: Optional[str] = None


class ScanRead(ScanBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    firestore_id: Optional[str] = None
    user_id: Optional[str] = None
    asana_synced: bool
    asana_synced_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    supporting_photos: List[SupportingPhotoRead] = []


# ─── Job Billing ──────────────────────────────────────────────

class JobBillingBase(BaseModel):
    account_number: str = ""
    month: str
    year: int
    kwh_usage: Optional[float] = None
    demand_kw: Optional[float] = None
    service_charge: Optional[float] = None
    energy_charge: Optional[float] = None
    demand_charge: Optional[float] = None
    taxes: Optional[float] = None
    total_amount: Optional[float] = None
    utility_name: Optional[str] = None
    canonical_utility: Optional[str] = None
    canonical_state: Optional[str] = None
    days_in_period: Optional[int] = None
    source_asset_id: Optional[str] = None
    source_filename: Optional[str] = None


class JobBillingCreate(JobBillingBase):
    job_id: uuid.UUID


class JobBillingRead(JobBillingBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    org_id: uuid.UUID
    imported_at: datetime


# ─── Jobs ────────────────────────────────────────────────────

class JobBase(BaseModel):
    client_name: Optional[str] = None
    job_number: Optional[str] = None
    client_group: Optional[str] = None
    status: str = "Start Here"
    advisor: Optional[str] = None
    job_date: Optional[date] = None
    notes: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    building_type: Optional[str] = None
    entity_type: Optional[str] = None
    utility_name: Optional[str] = None
    sqft: Optional[float] = None
    operating_hours_per_day: Optional[float] = None
    operating_days_per_week: Optional[float] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None


class JobCreate(JobBase):
    firestore_id: Optional[str] = None
    asana_project_gid: Optional[str] = None


class JobUpdate(BaseModel):
    client_name: Optional[str] = None
    job_number: Optional[str] = None
    client_group: Optional[str] = None
    status: Optional[str] = None
    advisor: Optional[str] = None
    job_date: Optional[date] = None
    notes: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    building_type: Optional[str] = None
    entity_type: Optional[str] = None
    utility_name: Optional[str] = None
    sqft: Optional[float] = None
    operating_hours_per_day: Optional[float] = None
    operating_days_per_week: Optional[float] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None


class JobRead(JobBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    firestore_id: Optional[str] = None
    user_id: Optional[str] = None
    created_by: Optional[str] = None
    device_count: int = 0
    scan_count: int = 0
    asana_project_gid: Optional[str] = None
    asana_synced: bool = False
    asana_last_synced_at: Optional[datetime] = None
    billing_utility_name: Optional[str] = None
    billing_account_number: Optional[str] = None
    billing_month_count: int = 0
    billing_last_imported_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class JobDetailRead(JobRead):
    devices: List[DeviceRead] = []
    billing_records: List[JobBillingRead] = []


# ─── Business Logic Responses ─────────────────────────────────

class SystemClassification(BaseModel):
    group: str  # 'hvac' | 'cold' | 'other'
    system: str


class DeviceReadiness(BaseModel):
    device_id: uuid.UUID
    device_name: str
    missing_fields: List[str]
    warnings: List[str]
    is_ready: bool


class JobReadinessReport(BaseModel):
    job_id: uuid.UUID
    total_devices: int
    ready_devices: int
    device_results: List[DeviceReadiness]
    has_12_month_billing: bool
    billing_month_count: int
    is_export_ready: bool
    warnings: List[str]
