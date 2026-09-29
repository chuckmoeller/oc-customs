"""
Product identifier -> standardized thermal-properties model.

Implements PROJECT.md's coating mapper spec: given a product_id (and
optionally a site-measured thickness_override), look up the product's
vetted baseline in known_products.py and build a StandardizedCoating.

emissivity and thermal_conductivity always come from the baseline --
only thickness is overridable, since PROJECT.md's Interface Contract
singles out site-measured application thickness as the field callers
plausibly override.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from hvac_taxonomy_bridge.coatings.exceptions import (
    CoatingMappingError,
    MissingFieldError,
    UnknownProductError,
)
from hvac_taxonomy_bridge.coatings.known_products import KNOWN_PRODUCTS
from hvac_taxonomy_bridge.models import (
    Provenance,
    ProvenanceSource,
    Quantity,
    StandardizedCoating,
    VerificationStatus,
)

__all__ = [
    "CoatingMappingError",
    "MissingFieldError",
    "UnknownProductError",
    "map_coating",
]


def map_coating(
    product_id: str,
    thickness_override: Optional[Quantity] = None,
    superseded_id: Optional[UUID] = None,
) -> StandardizedCoating:
    """Map a product identifier to a StandardizedCoating.

    With no thickness_override, the record is built entirely from the
    product's known_products.py baseline and superseded_id is forced
    to None -- a fresh baseline record can't be a correction of
    something else. If that baseline has no thickness value (e.g.
    armus_roof_pa100), a thickness_override is required and its
    absence raises MissingFieldError.

    With a thickness_override, that thickness replaces the baseline's,
    provenance reflects a site measurement rather than the
    manufacturer spec sheet, and superseded_id is passed through as
    given.
    """
    normalized_id = product_id.strip().lower()
    baseline = KNOWN_PRODUCTS.get(normalized_id)
    if baseline is None:
        supported = ", ".join(sorted(KNOWN_PRODUCTS)) or "(none registered yet)"
        raise UnknownProductError(
            f"No coating baseline registered for product_id={product_id!r}. "
            f"Registered: {supported}"
        )

    if thickness_override is None:
        if baseline.thickness is None:
            raise MissingFieldError(
                f"product_id={normalized_id!r} has no baseline thickness in "
                f"known_products.py; a thickness_override is required"
            )
        return StandardizedCoating(
            product_id=normalized_id,
            provenance=Provenance(
                source=ProvenanceSource.MANUFACTURER_SPEC_SHEET,
                verification=VerificationStatus.UNVERIFIED,
                reference=baseline.reference,
                superseded_id=None,
            ),
            emissivity=baseline.emissivity,
            thermal_conductivity=baseline.thermal_conductivity,
            thickness=baseline.thickness,
        )

    return StandardizedCoating(
        product_id=normalized_id,
        provenance=Provenance(
            source=ProvenanceSource.SITE_MEASUREMENT,
            verification=VerificationStatus.UNVERIFIED,
            reference=None,
            superseded_id=superseded_id,
        ),
        emissivity=baseline.emissivity,
        thermal_conductivity=baseline.thermal_conductivity,
        thickness=thickness_override,
    )
