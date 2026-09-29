"""
Shared exception types for equipment mappers.

Defined separately from mapper.py (rather than in it) so individual
equipment/types/*.py modules can raise them without an import cycle
back through the dispatcher in mapper.py, which imports each type
module to build its registry.
"""


class EquipmentMappingError(Exception):
    """Base class for all raw-equipment-mapping failures."""


class MissingFieldError(EquipmentMappingError):
    """A field required to build a standardized representation is absent."""


class AmbiguousFieldError(EquipmentMappingError):
    """A field is present but can't be unambiguously interpreted without guessing."""


class UnsupportedEquipmentTypeError(EquipmentMappingError):
    """raw['equipment_type'] doesn't match any registered equipment-type mapper."""
