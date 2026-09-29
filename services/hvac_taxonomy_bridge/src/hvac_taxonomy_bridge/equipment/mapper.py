"""
Entry point: raw nameplate dict -> standardized equipment model.

Per PROJECT.md, start with the DX cooling coil case in
equipment/types/dx_cooling.py before adding other equipment types.
"""

from __future__ import annotations

from typing import Callable

from hvac_taxonomy_bridge.equipment.exceptions import (
    AmbiguousFieldError,
    EquipmentMappingError,
    MissingFieldError,
    UnsupportedEquipmentTypeError,
)
from hvac_taxonomy_bridge.equipment.types import dx_cooling
from hvac_taxonomy_bridge.models import StandardizedEquipment

__all__ = [
    "AmbiguousFieldError",
    "EquipmentMappingError",
    "MissingFieldError",
    "UnsupportedEquipmentTypeError",
    "map_equipment",
]

_TYPE_MAPPERS: dict[str, Callable[[dict], StandardizedEquipment]] = {
    dx_cooling.EQUIPMENT_TYPE: dx_cooling.map_dx_cooling_coil,
}


def _normalize_equipment_type(value: str) -> str:
    return value.strip().lower().replace("-", "_").replace(" ", "_")


def map_equipment(raw: dict) -> StandardizedEquipment:
    """Map a raw nameplate-extraction dict to a StandardizedEquipment.

    Dispatches on raw['equipment_type'] to the matching
    equipment/types/*.py mapper. This package doesn't know any
    upstream system's own taxonomy (e.g. Site Hunter's
    category/subcategory axes) -- translating that into the canonical
    equipment_type value a given type mapper is registered under (see
    each module's EQUIPMENT_TYPE constant) is the caller's job.
    """
    raw_type = raw.get("equipment_type")
    if not raw_type or not str(raw_type).strip():
        raise MissingFieldError("raw input is missing required field 'equipment_type'")

    equipment_type = _normalize_equipment_type(str(raw_type))
    mapper = _TYPE_MAPPERS.get(equipment_type)
    if mapper is None:
        supported = ", ".join(sorted(_TYPE_MAPPERS))
        raise UnsupportedEquipmentTypeError(
            f"No equipment mapper registered for equipment_type={raw_type!r}. "
            f"Supported: {supported}"
        )
    return mapper(raw)
