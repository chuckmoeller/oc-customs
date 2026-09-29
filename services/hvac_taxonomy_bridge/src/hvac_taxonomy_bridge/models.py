"""
Standardized Pydantic models for the HVAC Taxonomy Bridge output contract.

Populate these first, per PROJECT.md's Build Order — everything else
(equipment mappers, coating mappers) is built against this contract.

Scope: this package stops at the standardized representation. No
EnergyPlus/IDF-specific fields or conversions belong here — see
PROJECT.md's Hard Scope Boundary. ASHRAE 205 schema validation/export
lives in schema/ashrae_205.py, which is expected to translate these
models into that package's types — this file has no dependency on
schema-205 itself.

Provenance vs. confidence: standardized records carry a Provenance
(where their values came from, and whether they supersede an earlier
record) and, for equipment, a separate extraction_confidence (how sure
the extraction was). These are deliberately independent axes — see
Provenance's and StandardizedEquipment's docstrings for why.

Records are immutable (``frozen=True``): a correction to a previously
recorded value is never an in-place edit, it's a new record whose
``provenance.superseded_id`` points at the one it corrects. This is a
hard constraint enforced by the model, not a style preference.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class EfficiencyMetric(str, Enum):
    """Which rating standard an equipment efficiency value is expressed in.

    Site Hunter's raw extraction reports a single ambiguous
    ``eer_or_seer`` field; resolving it to a specific metric is the
    equipment mapper's job (per PROJECT.md: raise rather than guess if
    it can't be determined). Extend with new members (e.g. HSPF) as
    mappers for other equipment types need them.
    """

    EER = "EER"
    SEER = "SEER"
    SEER2 = "SEER2"
    IEER = "IEER"
    COP = "COP"


class EfficiencyRating(BaseModel):
    """A single efficiency value paired with the metric it's expressed in."""

    metric: EfficiencyMetric
    value: float = Field(gt=0)


class Quantity(BaseModel):
    """A numeric value paired with its unit.

    Used for physical properties (thermal conductivity, thickness) that
    manufacturer spec sheets and field measurements plausibly report in
    different unit systems. Keeping value and unit together avoids
    silently assuming a unit the source didn't actually use. Unit is a
    free string rather than a closed enum — schema/ashrae_205.py owns
    normalizing to ASHRAE 205's canonical units, not this model.
    """

    value: float
    unit: str = Field(min_length=1)


class ProvenanceSource(str, Enum):
    """Where a standardized record's underlying values came from.

    Shared between equipment and coating records since both can
    originate from an automated extraction, a manufacturer's published
    data, a site measurement, or a person typing in a correction.
    """

    NAMEPLATE_EXTRACTION = "nameplate_extraction"
    MANUFACTURER_SPEC_SHEET = "manufacturer_spec_sheet"
    SITE_MEASUREMENT = "site_measurement"
    MANUAL_ENTRY = "manual_entry"


class VerificationStatus(str, Enum):
    """Whether anyone independent of ``Provenance.source`` has checked
    a record's values.

    Independent of ``source``: ``source`` says which entity produced
    the value (nameplate extraction, manufacturer spec sheet, ...);
    ``verification`` says whether that claim has been checked by anyone
    else. A manufacturer-sourced value and an independently-verified
    value can share the same ``source`` but must remain distinguishable
    by verification status, so the two are kept as separate fields
    rather than folded into a single enum.
    """

    UNVERIFIED = "unverified"
    INDEPENDENTLY_VERIFIED = "independently_verified"
    DISPUTED = "disputed"


class Provenance(BaseModel):
    """Where a record's values came from, whether that's been checked
    by anyone independent, and whether it corrects an earlier record.

    Deliberately separate from any confidence notion (e.g.
    ``StandardizedEquipment.extraction_confidence``): provenance answers
    "where did this come from / does it correct an earlier record,"
    while confidence answers "how sure are we." A nameplate extraction
    can be high-confidence but still just an extraction; a manual
    correction can carry low confidence despite superseding a wrong one.
    Conflating the two would make it impossible to represent either
    case.

    ``source`` and ``verification`` are a further split within
    provenance itself: ``source`` is which entity produced the value;
    ``verification`` is whether anyone independent of that source has
    checked it (see ``VerificationStatus``). These are also kept apart
    from ``extraction_confidence`` -- confidence is about how sure an
    extraction was, verification is about independent corroboration of
    the underlying claim regardless of how it was extracted.

    ``superseded_id`` points at the ``id`` of the StandardizedEquipment
    or StandardizedCoating record this one corrects, if any. Because
    those models are frozen (immutable), a correction can never be
    applied in place — it must be a new record that supersedes the old
    one via this field, so nothing downstream ever silently sees a
    value change out from under it.
    """

    source: ProvenanceSource
    verification: VerificationStatus
    reference: Optional[str] = None
    superseded_id: Optional[UUID] = None


class EquipmentIdentity(BaseModel):
    """Product-identifying fields, aligned with ASHRAE 205's
    ``description.product_information`` block.

    ``manufacturer`` and ``model_number`` are optional: real nameplate
    extractions are sometimes partially illegible (weathered, obscured,
    a bad photo), and a mapper encountering that should be able to
    produce a record saying so rather than being forced to invent a
    placeholder string just to satisfy a required field.
    """

    manufacturer: Optional[str] = Field(default=None, min_length=1)
    model_number: Optional[str] = Field(default=None, min_length=1)


class ExtractionConfidence(str, Enum):
    """How confident an equipment record's extracted values are.

    Independent of Provenance — see Provenance's docstring for why
    "where this came from" and "how sure we are" are kept separate.
    """

    CONFIRMED = "confirmed"
    PARTIAL = "partial"
    UNVERIFIED = "unverified"


class StandardizedEquipment(BaseModel):
    """ASHRAE 205-aligned standardized representation of a piece of HVAC
    equipment — the equipment mapper's output contract.

    Deliberately generic across equipment categories rather than
    specialized to DX cooling coils: PROJECT.md's raw input keys
    (manufacturer, model_number, equipment_type, tonnage, eer_or_seer,
    capacity_btu) describe a single flat shape, and all three consumers
    need to read it without knowing which equipment/types/*.py mapper
    produced it. If a future equipment category needs fields this shape
    can't hold, extend this model then — don't pre-build for it now.

    ``provenance`` and ``extraction_confidence`` are both required but
    answer different questions (see Provenance's docstring): where this
    record came from / what it corrects, vs. how sure the extraction
    was.

    ``capacity_btu`` has no default and is always required. A
    correction to a previously recorded capacity is never applied by
    mutating an existing instance (this model is frozen=True) or by
    defaulting a missing value — it's a new StandardizedEquipment whose
    ``provenance.superseded_id`` references the record it corrects.
    """

    model_config = ConfigDict(frozen=True)

    id: UUID = Field(default_factory=uuid4)
    equipment_type: str = Field(min_length=1)
    identity: EquipmentIdentity
    capacity_btu: float = Field(gt=0)
    tonnage: Optional[float] = Field(default=None, gt=0)
    efficiency: Optional[EfficiencyRating] = None
    provenance: Provenance
    extraction_confidence: ExtractionConfidence


class StandardizedCoating(BaseModel):
    """ASHRAE 205-aligned standardized representation of a coating /
    surface-material product — the coating mapper's output contract.

    ``product_id`` is the reliable, always-present identifier for which
    coating product this record represents (e.g. "pureti"). It lives
    here rather than on ``Provenance`` because product identity is
    coating-specific, while ``Provenance`` stays generic/shared with
    StandardizedEquipment. ``provenance.reference`` remains available
    for supplementary provenance detail -- a spec sheet URL, a lot
    number -- but is not a substitute for ``product_id``.

    ``thickness`` in particular is expected to often be a site-measured
    override (per PROJECT.md's Interface Contract) rather than the
    product's nominal spec value; ``provenance`` documents where the
    baseline (pre-override) values came from, and — via
    ``superseded_id`` — whether this record corrects an earlier one.
    Corrections are new records, never in-place edits, since this model
    is frozen=True.
    """

    model_config = ConfigDict(frozen=True)

    id: UUID = Field(default_factory=uuid4)
    product_id: str = Field(min_length=1)
    provenance: Provenance
    emissivity: float = Field(ge=0, le=1)
    thermal_conductivity: Quantity
    thickness: Quantity
