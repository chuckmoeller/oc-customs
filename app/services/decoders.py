import re
from typing import Any, Dict, Optional, Tuple


def decode_capacity_from_model(model: str) -> Optional[float]:
    """Extracts nominal cooling capacity (tonnage) from standard model MBH digits.
    Standard HVAC convention embeds thousands of BTU/hr (e.g., 036 = 36k BTU = 3.0 tons,
    060 = 60k BTU = 5.0 tons, 120 = 120k BTU = 10.0 tons).
    """
    if not model:
        return None
    clean = re.sub(r"[^A-Z0-9]", "", model.upper())

    # Look for standard 3-digit MBH sizes (018, 024, 030, 036, 042, 048, 060, 072, 090, 102, 120, 150, 180, 240, 300)
    match = re.search(r"(?:018|024|030|036|042|048|060|072|090|102|120|150|180|240|300)", clean)
    if match:
        mbh = int(match.group(0))
        return round(mbh / 12.0, 2)

    # 2-digit patterns after prefix (e.g., 48 = 4 tons)
    match2 = re.search(r"[A-Z]+(\d{2,3})", clean)
    if match2:
        val = int(match2.group(1))
        if val in (18, 24, 30, 36, 42, 48, 60, 72, 90, 120):
            return round(val / 12.0, 2)

    return None


def decode_voltage_from_model(model: str) -> Optional[str]:
    """Decodes standard voltage indicator character from model number."""
    if not model:
        return None
    clean = model.upper().strip()

    # Carrier / Trane / Lennox voltage characters often embedded near the end or middle
    if "460" in clean or re.search(r"[-_ ]4\b", clean) or re.search(r"\b460V\b", clean):
        return "460/3/60"
    if "208-230" in clean or "230" in clean or re.search(r"[-_ ]3\b", clean):
        return "208-230/3/60"
    if "575" in clean or re.search(r"[-_ ]5\b", clean):
        return "575/3/60"
    if "115" in clean or re.search(r"[-_ ]1\b", clean):
        return "115/1/60"

    return None


def decode_serial_date(serial: str, manufacturer: Optional[str] = None) -> Optional[int]:
    """Decodes the manufacture year from serial number using brand-specific patterns."""
    if not serial:
        return None
    s = serial.upper().strip()
    mfg = (manufacturer or "").lower().strip()

    # Carrier / Bryant / Payne: 4 digits at start (WWYY) -> e.g. 3418xxxx = 2018
    if "carrier" in mfg or "bryant" in mfg or "payne" in mfg:
        m = re.match(r"^(\d{2})(\d{2})", s)
        if m:
            week, yr = int(m.group(1)), int(m.group(2))
            if 1 <= week <= 53:
                year = 2000 + yr if yr <= 40 else 1900 + yr
                return year

    # Goodman / Amana: 4 digits (YYMM) -> e.g. 1905xxxx = May 2019
    if "goodman" in mfg or "amana" in mfg:
        m = re.match(r"^(\d{2})(\d{2})", s)
        if m:
            yr, month = int(m.group(1)), int(m.group(2))
            if 1 <= month <= 12:
                year = 2000 + yr if yr <= 40 else 1900 + yr
                return year

    # Trane: first digit or 9-digit serial format
    if "trane" in mfg or "american standard" in mfg:
        m = re.match(r"^(\d{2})(\d{2})", s)
        if m:
            yr = int(m.group(1))
            if yr >= 80:
                return 1900 + yr
            elif yr <= 35:
                return 2000 + yr

    # General 4-digit year embedded fallback (1980-2035)
    gen = re.search(r"\b(19[8-9]\d|20[0-3]\d)\b", s)
    if gen:
        return int(gen.group(1))

    return None


CARRIER_PKG_TONS = {
    "04": 3.0,
    "05": 4.0,
    "06": 5.0,
    "07": 6.0,
    "08": 7.5,
    "09": 8.5,
    "12": 10.0,
    "14": 12.5,
    "16": 15.0,
    "17": 15.0,
    "20": 17.5,
    "24": 20.0,
    "28": 25.0,
    "30": 27.5,
}


def catch_tag(model_number: str, manufacturer: Optional[str] = None) -> Dict[str, Any]:
    """Deterministic fast-path regex tag catcher based on src/lib/tagCatcher.js.
    Returns standardized ASHRAE 205 specs and provenance.
    """
    if not model_number:
        return {"matched": False}

    clean_model = model_number.upper().strip()
    mfg = (manufacturer or "").lower().strip()

    result = {
        "matched": False,
        "model_match_confirmed": False,
        "model_match_source": None,
        "ashrae_205_class": None,
        "matched_base_model": clean_model,
        "nominal_cooling_tons": None,
        "efficiency_seer": None,
        "voltage": None,
        "requires_human_audit": False,
    }

    # Carrier 48/50 series Rooftop Units: e.g. 48TCEA06A2A5A0A0
    carrier_match = re.match(r"^(48|50)([A-Z]{2,4})[- ]?(\d{2,3})", clean_model)
    if carrier_match:
        base = f"{carrier_match.group(1)}{carrier_match.group(2)}"
        size_digits = carrier_match.group(3)
        tons = CARRIER_PKG_TONS.get(size_digits)
        if tons is None:
            mbh = int(size_digits)
            tons = round(mbh / 12.0, 1) if mbh in (18, 24, 30, 36, 42, 48, 60, 72, 90, 102, 120, 150) else round(mbh, 1)

        result.update(
            {
                "matched": True,
                "model_match_confirmed": True,
                "model_match_source": "fast_path",
                "ashrae_205_class": "UnitarySystem_PackagedRooftop",
                "matched_base_model": base,
                "nominal_cooling_tons": tons,
                "voltage": decode_voltage_from_model(clean_model),
            }
        )
        return result

    # Trane Y-series / Voyager RTUs: e.g. YCD060C400BF or YHC072E3R
    trane_match = re.match(r"^(Y[A-Z]{2}|T[A-Z]{2})[- ]?(\d{3})", clean_model)
    if trane_match:
        base = trane_match.group(1)
        mbh = int(trane_match.group(2))
        result.update(
            {
                "matched": True,
                "model_match_confirmed": True,
                "model_match_source": "fast_path",
                "ashrae_205_class": "UnitarySystem_PackagedRooftop",
                "matched_base_model": base,
                "nominal_cooling_tons": round(mbh / 12.0, 1),
                "voltage": decode_voltage_from_model(clean_model),
            }
        )
        return result

    # York Sun Choice / Predator: e.g. ZJ060, ZF090, ZR120
    york_match = re.match(r"^(Z[A-Z]|D[A-Z])[- ]?(\d{3})", clean_model)
    if york_match:
        mbh = int(york_match.group(2))
        result.update(
            {
                "matched": True,
                "model_match_confirmed": True,
                "model_match_source": "fast_path",
                "ashrae_205_class": "UnitarySystem_PackagedRooftop",
                "matched_base_model": york_match.group(1),
                "nominal_cooling_tons": round(mbh / 12.0, 1),
                "voltage": decode_voltage_from_model(clean_model),
            }
        )
        return result

    # Lennox Energence / Landmark: e.g. LGA060, KGA090, LCA120
    lennox_match = re.match(r"^([LKT][A-Z]{2})[- ]?(\d{3})", clean_model)
    if lennox_match:
        mbh = int(lennox_match.group(2))
        result.update(
            {
                "matched": True,
                "model_match_confirmed": True,
                "model_match_source": "fast_path",
                "ashrae_205_class": "UnitarySystem_PackagedRooftop",
                "matched_base_model": lennox_match.group(1),
                "nominal_cooling_tons": round(mbh / 12.0, 1),
                "voltage": decode_voltage_from_model(clean_model),
            }
        )
        return result

    # Generic capacity extraction fallback
    cap = decode_capacity_from_model(clean_model)
    if cap:
        result.update(
            {
                "matched": True,
                "model_match_confirmed": False,
                "model_match_source": "nomenclature_decode",
                "nominal_cooling_tons": cap,
                "voltage": decode_voltage_from_model(clean_model),
                "requires_human_audit": True,
            }
        )

    return result
