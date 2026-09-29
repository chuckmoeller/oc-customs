// Canonical equipment taxonomy — Firebase is the system of record.
//
// Shape: CATEGORY (family) → list of SUBCATEGORIES. The HVAC and Cold Storage
// subcategory values are BYTE-EXACT with the "Submission Form 3.0" forced
// dropdowns, so the truncated Asana/Excel exports drawn from Firebase are always
// form-valid. Heating + Other exist in Firebase for completeness (no Excel section
// yet). equipmentType (Gas/Electric, Heat Pump config, …) is a separate 3rd axis
// kept only in Firebase.
export const CATEGORIES = {
  HVAC: [
    'PTAC',
    'Split System',
    'RTU',
    'Chiller',
    'VRF',
    'Mini-Split',
    'Package Unit',
    'Rooftop Unit',
    'Heat Pump',
    'Other',
  ],
  'Cold Storage': [
    'Walk-In Cooler',
    'Walk-In Freezer',
    'Reach-In Cooler',
    'Reach-In Freezer',
    'Display Case',
    'Ice Machine',
    'Blast Chiller',
    'Prep Table',
    'Other',
  ],
  // Firebase-only (no Excel form section yet) — proposed industry-standard lists.
  Heating: ['Boiler', 'Furnace', 'Unit Heater', 'Water Heater', 'Other'],
  Other: ['Controls', 'Electrical', 'Plumbing', 'Pump', 'Cooling Tower', 'Air Handler', 'Other'],
};

// Triage bucket for scans that match no Asana section. Routing here (rather
// than writing an unmatched canonical family) keeps the item syncable and flags
// it for manual research downstream. The Asana project should have a section of this name.
export const UNIDENTIFIED_CATEGORY = 'Unidentified-Needs Research';

// Maps a spec-hunter equipment CLASS (its `category` field, e.g. "Rooftop Unit",
// "Chiller", "Condensing Unit") to the canonical { category: family, subcategory }.
// Keys are lowercased. Classes that have NO Submission Form 3.0 dropdown value map
// to subcategory "Other" today (resolveTaxonomy preserves the precise class in
// `subcategoryDetail`); remap these once the form owner adds the dropdown entries.
export const CLASS_TO_TAXONOMY = {
  // ── HVAC ──
  'rooftop unit': { category: 'HVAC', subcategory: 'Rooftop Unit' },
  rtu: { category: 'HVAC', subcategory: 'Rooftop Unit' },
  'split system': { category: 'HVAC', subcategory: 'Split System' },
  'mini-split': { category: 'HVAC', subcategory: 'Mini-Split' },
  'package unit': { category: 'HVAC', subcategory: 'Package Unit' },
  'heat pump': { category: 'HVAC', subcategory: 'Heat Pump' },
  chiller: { category: 'HVAC', subcategory: 'Chiller' },
  'vrf-vrv split system': { category: 'HVAC', subcategory: 'VRF' },
  vrf: { category: 'HVAC', subcategory: 'VRF' },
  vrv: { category: 'HVAC', subcategory: 'VRF' },
  ptac: { category: 'HVAC', subcategory: 'PTAC' },
  // HVAC air-side / hydronic — no form dropdown yet → Other (class kept in detail)
  'air handler': { category: 'HVAC', subcategory: 'Other' },
  'fan coil': { category: 'HVAC', subcategory: 'Other' },
  'cooling tower': { category: 'HVAC', subcategory: 'Other' },
  pump: { category: 'HVAC', subcategory: 'Other' },

  // ── Cold Storage ──
  'walk-in cooler': { category: 'Cold Storage', subcategory: 'Walk-In Cooler' },
  'walk-in freezer': { category: 'Cold Storage', subcategory: 'Walk-In Freezer' },
  'reach-in cooler': { category: 'Cold Storage', subcategory: 'Reach-In Cooler' },
  'reach-in freezer': { category: 'Cold Storage', subcategory: 'Reach-In Freezer' },
  'display case': { category: 'Cold Storage', subcategory: 'Display Case' },
  'refrigerated case': { category: 'Cold Storage', subcategory: 'Display Case' },
  'ice machine': { category: 'Cold Storage', subcategory: 'Ice Machine' },
  'ice maker': { category: 'Cold Storage', subcategory: 'Ice Machine' },
  'prep table': { category: 'Cold Storage', subcategory: 'Prep Table' },
  'blast chiller': { category: 'Cold Storage', subcategory: 'Blast Chiller' },
  // Refrigeration classes with no form dropdown yet → Other (class kept in detail)
  'condensing unit': { category: 'Cold Storage', subcategory: 'Other' },
  evaporator: { category: 'Cold Storage', subcategory: 'Other' },
  'unit cooler': { category: 'Cold Storage', subcategory: 'Other' },
  'compressor rack': { category: 'Cold Storage', subcategory: 'Other' },

  // ── Heating ──
  boiler: { category: 'Heating', subcategory: 'Boiler' },
  furnace: { category: 'Heating', subcategory: 'Furnace' },
  'unit heater': { category: 'Heating', subcategory: 'Unit Heater' },
  'water heater': { category: 'Heating', subcategory: 'Water Heater' },
};

const FAMILY_BY_LOWER = Object.fromEntries(
  Object.keys(CATEGORIES).map((f) => [f.toLowerCase(), f])
);

// Returns the exact CATEGORIES[family] entry matching `value` (case-insensitive),
// or 'Other' when there's no match for that family.
function matchSubcategory(family, value) {
  const list = CATEGORIES[family] || [];
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (!v) return '';
  return list.find((s) => s.toLowerCase() === v) || 'Other';
}

/**
 * Resolve a scan/lookup result into the canonical Firebase taxonomy.
 *
 * @param {string} specCategory   spec-hunter `category` (equipment class) OR an
 *                                already-canonical family name (re-processing).
 * @param {string} specSubcategory spec-hunter `subcategory` (variant/class detail).
 * @param {string} equipmentType  3rd-axis variant (Gas/Electric, …), passed through.
 * @returns {{category, subcategory, equipmentType, subcategoryDetail?}}
 *   category = family, subcategory = form-valid value. `subcategoryDetail` is set
 *   only when the precise class collapses to "Other", so Firebase stays complete.
 */
export function resolveTaxonomy(specCategory, specSubcategory = '', equipmentType = '') {
  const raw = String(specCategory || '').trim();
  const key = raw.toLowerCase();
  const et = equipmentType || '';

  const finalize = (family, subcategory, detailSource) => {
    const out = { category: family, subcategory, equipmentType: et };
    if (subcategory === 'Other' && detailSource) {
      out.subcategoryDetail = String(detailSource).trim();
    }
    return out;
  };

  // Already a canonical family (e.g. re-processing existing Firebase data).
  if (FAMILY_BY_LOWER[key]) {
    const family = FAMILY_BY_LOWER[key];
    return finalize(family, matchSubcategory(family, specSubcategory), specSubcategory || raw);
  }

  // spec-hunter equipment class.
  const mapped = CLASS_TO_TAXONOMY[key];
  if (mapped) return finalize(mapped.category, mapped.subcategory, raw);

  // Unknown class — leave family blank for manual selection; preserve raw value.
  return { category: '', subcategory: '', equipmentType: et, subcategoryDetail: raw };
}
