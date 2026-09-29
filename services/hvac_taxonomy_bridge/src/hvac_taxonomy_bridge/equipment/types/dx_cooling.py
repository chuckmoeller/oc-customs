"""
DX cooling coil mapping: raw nameplate fields -> standardized representation.

This is the first equipment type to implement, per PROJECT.md's Build
Order. Get this one fully correct and tested before adding others.

Per PROJECT.md's Interface Contract, capacity_btu is the only field
this mapper raises a typed exception for -- it's the one value The
Calibrator cannot function without. manufacturer, model_number, and
efficiency are all allowed to end up missing or unresolvable; when that
happens the record is still constructed (with those fields None/absent)
and extraction_confidence reflects how complete/certain the record is,
rather than the mapper refusing to produce a record at all.
"""

from __future__ import annotations

from hvac_taxonomy_bridge.equipment.exceptions import AmbiguousFieldError, MissingFieldError
from hvac_taxonomy_bridge.models import (
    EfficiencyMetric,
    EfficiencyRating,
    EquipmentIdentity,
    ExtractionConfidence,
    Provenance,
    ProvenanceSource,
    StandardizedEquipment,
    VerificationStatus,
)

EQUIPMENT_TYPE = "dx_cooling_coil"
"""Canonical raw['equipment_type'] value this mapper handles, after
mapper.py's normalization (lowercase; spaces/hyphens -> underscores).

This package doesn't know Site Hunter's (or any other consumer's)
internal taxonomy -- see PROJECT.md's Interface Contract. Whatever
raw['equipment_type'] value the caller passes for a DX/unitary
cooling coil (packaged AC, RTU, split system, PTAC, etc.) is the
caller's translation responsibility; this constant is only the
canonical value *this* mapper is registered under.
"""

BTU_PER_TON = 12000.0
_CAPACITY_AGREEMENT_TOLERANCE = 0.05
"""Max relative disagreement allowed between a stated capacity_btu and
one derived from tonnage before treating them as conflicting rather
than as the same rating rounded two different ways."""


def map_dx_cooling_coil(raw: dict) -> StandardizedEquipment:
    """Map a raw DX cooling coil nameplate dict to a StandardizedEquipment.

    Assumes the caller (mapper.py's dispatcher) has already confirmed
    raw['equipment_type'] identifies this as a DX cooling coil -- this
    function doesn't re-check that key.

    Raises MissingFieldError/AmbiguousFieldError only if a valid
    capacity_btu can't be determined. Every other field degrades
    gracefully into extraction_confidence instead of blocking the record.
    """
    capacity_btu, tonnage = _resolve_capacity(raw)
    manufacturer, manufacturer_confirmed = _resolve_identity_field(raw, "manufacturer")
    model_number, model_number_confirmed = _resolve_identity_field(raw, "model_number")
    efficiency, efficiency_status = _resolve_efficiency(raw)

    confidence = _resolve_confidence(
        manufacturer_confirmed=manufacturer_confirmed,
        model_number_confirmed=model_number_confirmed,
        efficiency_status=efficiency_status,
    )

    return StandardizedEquipment(
        equipment_type=EQUIPMENT_TYPE,
        identity=EquipmentIdentity(manufacturer=manufacturer, model_number=model_number),
        capacity_btu=capacity_btu,
        tonnage=tonnage,
        efficiency=efficiency,
        # This mapper only ever reads a raw nameplate dict -- it has no
        # independent source to check the reading against.
        provenance=Provenance(
            source=ProvenanceSource.NAMEPLATE_EXTRACTION,
            verification=VerificationStatus.UNVERIFIED,
        ),
        extraction_confidence=confidence,
    )


def _try_parse_float(value) -> float | None:
    """Best-effort numeric parse. Returns None rather than raising --
    callers decide whether a failed parse matters for their field."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _resolve_capacity(raw: dict) -> tuple[float, float | None]:
    """Resolve (capacity_btu, tonnage) for the output record.

    capacity_btu is the only field this module raises for: missing
    entirely with no usable tonnage to derive it from, present but
    unparseable, or present but conflicting with a valid tonnage beyond
    tolerance. tonnage is informational only -- if it's unusable it's
    simply omitted from the output; it never blocks a valid capacity_btu.
    """
    raw_capacity = raw.get("capacity_btu")
    tonnage = _try_parse_float(raw.get("tonnage"))

    if raw_capacity is not None:
        capacity_btu = _try_parse_float(raw_capacity)
        if capacity_btu is None:
            raise AmbiguousFieldError(f"'capacity_btu' value {raw_capacity!r} is not numeric")
        if tonnage is not None:
            derived_from_tonnage = tonnage * BTU_PER_TON
            disagreement = abs(derived_from_tonnage - capacity_btu) / max(
                derived_from_tonnage, capacity_btu
            )
            if disagreement > _CAPACITY_AGREEMENT_TOLERANCE:
                raise AmbiguousFieldError(
                    f"'capacity_btu' ({capacity_btu}) and 'tonnage' ({tonnage}, implying "
                    f"{derived_from_tonnage:.0f} Btu/h) disagree by more than "
                    f"{_CAPACITY_AGREEMENT_TOLERANCE:.0%}"
                )
        return capacity_btu, tonnage

    if tonnage is not None:
        return tonnage * BTU_PER_TON, tonnage

    raise MissingFieldError(
        "DX cooling coil requires 'capacity_btu' or a numeric 'tonnage' to determine capacity"
    )


def _resolve_identity_field(raw: dict, field_name: str) -> tuple[str | None, bool]:
    """Returns (value, is_confirmed). Never raises: per PROJECT.md,
    manufacturer/model_number may be None on a PARTIAL record."""
    value = raw.get(field_name)
    if value is None or not str(value).strip():
        return None, False
    return str(value).strip(), True


def _resolve_efficiency(raw: dict) -> tuple[EfficiencyRating | None, str]:
    """Returns (efficiency, status), status in {"confirmed", "missing", "unverified"}.

    Never raises. "missing" means eer_or_seer wasn't provided at all --
    a clean, confident gap. "unverified" means a value was provided but
    couldn't be confidently interpreted (no/unrecognized
    efficiency_metric, or a non-numeric value) -- a categorically less
    certain situation than a plain absence, which is why it maps to a
    different extraction_confidence outcome (see _resolve_confidence).
    """
    eer_or_seer = raw.get("eer_or_seer")
    if eer_or_seer is None:
        return None, "missing"

    value = _try_parse_float(eer_or_seer)
    metric_name = raw.get("efficiency_metric")
    if value is None or not metric_name:
        return None, "unverified"

    try:
        metric = EfficiencyMetric(str(metric_name).strip().upper())
    except ValueError:
        return None, "unverified"

    return EfficiencyRating(metric=metric, value=value), "confirmed"


def _resolve_confidence(
    *, manufacturer_confirmed: bool, model_number_confirmed: bool, efficiency_status: str
) -> ExtractionConfidence:
    """CONFIRMED only if manufacturer, model_number, and efficiency are
    all present and unambiguous. UNVERIFIED if any field's data was
    present but uninterpretable (a genuine "can't tell if this should
    count" case, per PROJECT.md -- don't guess between PARTIAL and
    CONFIRMED). Otherwise PARTIAL: at least one field is cleanly absent,
    but nothing was ambiguous enough to warrant UNVERIFIED.
    """
    if efficiency_status == "unverified":
        return ExtractionConfidence.UNVERIFIED
    if manufacturer_confirmed and model_number_confirmed and efficiency_status == "confirmed":
        return ExtractionConfidence.CONFIRMED
    return ExtractionConfidence.PARTIAL
