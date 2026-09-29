import re
from typing import Any, Dict


EXACT_COLD = {
    "condensing unit": "Condensing Unit",
    "refrigeration condensing unit": "Condensing Unit",
    "condensing unit (refrigeration)": "Condensing Unit",
    "evaporator": "Evaporator",
    "evaporator coil (refrigeration)": "Evaporator",
    "unit cooler": "Evaporator",
    "compressor rack": "Compressor Rack",
    "refrigeration rack": "Compressor Rack",
    "walk-in cooler": "Walk-in Cooler",
    "walk-in freezer": "Walk-in Freezer",
    "walkin cooler": "Walk-in Cooler",
    "walkin freezer": "Walk-in Freezer",
    "reach-in cooler": "Reach-in Cooler",
    "reach-in freezer": "Reach-in Freezer",
    "reach in cooler": "Reach-in Cooler",
    "reach in freezer": "Reach-in Freezer",
    "refrigerated case": "Display Case",
    "display case": "Display Case",
    "merchandiser": "Display Case",
    "ice machine": "Ice Machine",
    "ice maker": "Ice Machine",
    "blast chiller": "Blast Chiller",
    "blast freezer": "Blast Freezer",
    "f&b cooler": "F&B Cooler",
    "beverage cooler": "F&B Cooler",
    "cold storage room": "Cold Storage",
    "prep table": "Cold Storage",
}

EXACT_HVAC = {
    "rooftop unit": "RTU",
    "rtu": "RTU",
    "split system": "Split System",
    "heat pump": "Heat Pump",
    "chiller": "Chiller",
    "boiler": "Boiler",
    "air handler": "Air Handler",
    "air handling unit": "Air Handler",
    "ahu": "Air Handler",
    "vrf-vrv split system": "VRF/VRV",
    "vrf": "VRF/VRV",
    "vrv": "VRF/VRV",
    "fan coil": "Fan Coil",
    "fan coil unit": "Fan Coil",
    "ptac": "PTAC",
    "vtac": "VTAC",
    "furnace": "Furnace",
    "cooling tower": "Cooling Tower",
}

COLD_STORAGE_MFGS = [
    "heatcraft",
    "bohn",
    "larkin",
    "climate control",
    "chandler",
    "krack",
    "russell",
    "witt",
    "coldzone",
    "keeprite",
    "trenton",
    "bally",
    "kolpak",
    "norlake",
    "true",
    "beverage-air",
    "traulsen",
    "hoshizaki",
    "manitowoc",
    "scotsman",
    "copeland",
    "bitzer",
    "carlyle",
    "dorin",
    "frick",
    "vilter",
]


def is_cold_storage_context(category: str, mfg: str, model: str) -> bool:
    cat = (category or "").lower()
    mfg_clean = (mfg or "").lower().strip()
    model_clean = (model or "").lower().strip()

    if any(m in mfg_clean for m in COLD_STORAGE_MFGS):
        return True
    if any(m in cat for m in ["refrigerat", "cold", "cooler", "freezer", "ice"]):
        return True
    # Heatcraft / Bohn / Larkin model prefixes
    if re.match(r"^(let|fpe|bma|wma|lcs|rft|bdt|chd)", model_clean):
        return True
    return False


def classify_system(device: Dict[str, Any]) -> Dict[str, str]:
    """Classifies a device into group ('hvac' | 'cold' | 'other') and system type.
    Faithful port of classifySystem in site-hunter's server/routes/export.js.
    """
    cat = str(device.get("category") or "").lower().strip()
    sub = str(device.get("subcategory") or "").lower().strip()
    typ = str(device.get("type") or device.get("equipment_type") or "").lower().strip()
    name = str(device.get("device_name") or device.get("name") or "").lower().strip()
    text = f"{cat} {sub} {typ} {name}"
    model = str(device.get("model_number") or "").strip()
    mfg = str(device.get("manufacturer") or "").strip()

    flat = re.sub(r"[\s\-_]+", "", text)
    cold_parent = bool(re.search(r"coldstorage|refrigerat", flat))

    # 1. Exact Category / Type matching (Asana Type custom field wins over category)
    if typ and typ in EXACT_COLD:
        return {"group": "cold", "system": EXACT_COLD[typ]}
    if cat in EXACT_COLD:
        return {"group": "cold", "system": EXACT_COLD[cat]}

    if typ and typ in EXACT_HVAC:
        return {"group": "hvac", "system": EXACT_HVAC[typ]}
    if cat in EXACT_HVAC:
        return {"group": "hvac", "system": EXACT_HVAC[cat]}

    # 2. Model / Manufacturer cold storage detection
    if is_cold_storage_context(cat, mfg, model):
        if "walk" in text and "freezer" in text:
            return {"group": "cold", "system": "Walk-in Freezer"}
        if "walk" in text:
            return {"group": "cold", "system": "Walk-in Cooler"}
        if "reach" in text and "freezer" in text:
            return {"group": "cold", "system": "Reach-in Freezer"}
        if "reach" in text:
            return {"group": "cold", "system": "Reach-in Cooler"}
        if "ice" in text:
            return {"group": "cold", "system": "Ice Machine"}
        if any(k in text for k in ["display", "case", "merchandiser", "glass door", "beverage"]) or bool(re.search(r"\bgdm\b", model, re.IGNORECASE)):
            return {"group": "cold", "system": "Display Case"}
        if "evaporator" in text or "unit cooler" in text:
            return {"group": "cold", "system": "Evaporator"}
        if "condens" in flat:
            return {"group": "cold", "system": "Condensing Unit"}
        if "rack" in text:
            return {"group": "cold", "system": "Compressor Rack"}
        return {"group": "cold", "system": device.get("subcategory") or device.get("category") or "Cold Storage"}

    # 3. Fuzzy HVAC fallback (skipped when parent is Cold Storage)
    if not cold_parent:
        if "rtu" in flat or "rooftop" in flat:
            return {"group": "hvac", "system": "RTU"}
        if "split system" in text or "split" in text:
            return {"group": "hvac", "system": "Split System"}
        if "ptac" in text:
            return {"group": "hvac", "system": "PTAC"}
        if "vtac" in text:
            return {"group": "hvac", "system": "VTAC"}
        if "chiller" in text:
            return {"group": "hvac", "system": "Chiller"}
        if "boiler" in text:
            return {"group": "hvac", "system": "Boiler"}
        if "heat pump" in text:
            return {"group": "hvac", "system": "Heat Pump"}
        if "vrf" in text or "vrv" in text:
            return {"group": "hvac", "system": "VRF/VRV"}
        if "fan coil" in text:
            return {"group": "hvac", "system": "Fan Coil"}
        if "air handler" in text or "ahu" in text:
            return {"group": "hvac", "system": "Air Handler"}
        if "furnace" in text:
            return {"group": "hvac", "system": "Furnace"}

    # 4. Fuzzy Cold Storage fallback
    if ("walk" in text and "cooler" in text) or "walk-in cooler" in text:
        return {"group": "cold", "system": "Walk-in Cooler"}
    if ("walk" in text and "freezer" in text) or "walk-in freezer" in text:
        return {"group": "cold", "system": "Walk-in Freezer"}
    if "reach" in text and "cooler" in text:
        return {"group": "cold", "system": "Reach-in Cooler"}
    if "reach" in text and "freezer" in text:
        return {"group": "cold", "system": "Reach-in Freezer"}
    if "ice machine" in text or "ice maker" in text:
        return {"group": "cold", "system": "Ice Machine"}
    if any(k in text for k in ["beverage", "display", "glass door"]):
        return {"group": "cold", "system": "F&B Cooler"}
    if "evaporator" in text or "unit cooler" in text:
        return {"group": "cold", "system": "Evaporator"}
    if "condens" in flat:
        return {"group": "cold", "system": "Condensing Unit"}
    if "cooler" in text or "refrigerator" in text:
        return {"group": "cold", "system": "Walk-in Cooler"}
    if "freezer" in text:
        return {"group": "cold", "system": "Walk-in Freezer"}
    if "cold" in text or "refrigeration" in text:
        return {"group": "cold", "system": "Cold Storage"}

    # 5. HVAC keyword fallback
    hvac_keywords = ["hvac", "seer", "air conditioning", "package unit"]
    if any(k in text for k in hvac_keywords):
        return {"group": "hvac", "system": "Other HVAC"}

    return {
        "group": "other",
        "system": device.get("subcategory") or device.get("category") or "Unclassified",
    }
