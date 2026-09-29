"""
Baseline (manufacturer-spec-sheet) coating property data.

Populated from coating-thermal-properties-research.md per that doc's
"Notes for whoever builds known_products.py" section. Only products
with both a real emissivity value AND a real thermal_conductivity
value carrying no FTC dispute flag are included:

- nanotech_cool_touch
- armus_roof_pa100

Everything else is deliberately absent rather than loaded with
null/placeholder/borrowed values:

- Pureti: excluded by the doc itself -- doesn't fit this model's shape.
- FLAG-1 products (Elastocoat S-5000, Heat-Flex 3500, Premium White
  Elastomeric, Karnak 169, PolyBrite 70/71-HS): no verifiable thermal
  data at all.
- Super Therm, MultiCeramics, Thermo-Shield, FGI-4440: FLAG-3/4 --
  their claimed thermal_conductivity is a disguised R-value, not a
  real conductivity figure, and is never loaded here.
- NanoTech Materials Cool Roof Coat: the doc explicitly has no
  disclosed numeric emissivity for this specific product (an earlier
  draft mistakenly substituted its sibling Cool Touch's emissivity;
  the doc corrects that mistake). Cool Touch, below, has its own
  disclosed emissivity and is included on its own merits.

Armus Roof PA100's table in the research doc has Emissivity and
Thermal Conductivity rows but no Thickness row -- no thickness value
is disclosed anywhere in the doc for this product. Rather than invent
one, its baseline thickness is left as None; coatings/mapper.py
requires callers to supply a thickness_override for this product.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from hvac_taxonomy_bridge.models import Quantity


@dataclass(frozen=True)
class ProductBaseline:
    """A product's nominal (manufacturer spec-sheet) properties.

    thickness is Optional because not every included product's spec
    sheet discloses one -- see armus_roof_pa100 below, whose baseline
    thickness is None and therefore requires a thickness_override at
    map_coating() call time.
    """

    emissivity: float
    thermal_conductivity: Quantity
    thickness: Optional[Quantity]
    reference: str


KNOWN_PRODUCTS: dict[str, ProductBaseline] = {
    "nanotech_cool_touch": ProductBaseline(
        emissivity=0.88,
        thermal_conductivity=Quantity(value=0.05, unit="W/(m*K)"),
        thickness=Quantity(value=40.0, unit="mil"),
        reference=(
            "NanoTech Materials TDS (Cool Touch): emissivity >0.88, thermal "
            "conductivity ~0.05 W/m*K (test method undisclosed), thickness 40 "
            "mils single coat. Per coating-thermal-properties-research.md "
            "follow-up findings (Section 6): no independent reproduction of "
            "the conductivity figure found anywhere, and no FTC action or "
            "legal/industry dispute against NanoTech -- UNVERIFIED, not "
            "DISPUTED."
        ),
    ),
    "armus_roof_pa100": ProductBaseline(
        emissivity=0.88,
        thermal_conductivity=Quantity(value=0.08, unit="W/(m*K)"),
        thickness=None,
        reference=(
            "Armus Solutions TDS (Roof PA100): emissivity 0.88 (ASTM C1371). "
            "Thermal conductivity 0.08 +/- 0.07 W/(m*K) per ISO 12667:2004 -- "
            "thermal_conductivity value recorded is the point estimate only; "
            "source reports high relative uncertainty (~88%) on this figure. "
            "No thickness value is disclosed anywhere in "
            "coating-thermal-properties-research.md for this product; a "
            "thickness_override is required to map it."
        ),
    ),
}
