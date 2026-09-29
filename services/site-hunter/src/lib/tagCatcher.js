/**
 * Deterministic Tag Catcher for Site Hunter frontend.
 *
 * Implements hardened, anchored regex matching with non-greedy suffix handling
 * to provide an instant, deterministic fast-path conforming strictly to ASHRAE 205.
 */

// Common manufacturer aliases mapped to their canonical names
export const MANUFACTURER_ALIASES = {
  carr: 'Carrier',
  carrier: 'Carrier',
  bryant: 'Carrier',
  payne: 'Carrier',
  aaon: 'AAON',
  trne: 'Trane',
  trane: 'Trane',
  'american standard': 'Trane',
  jci: 'York',
  york: 'York',
  'johnson controls': 'York',
  'johnson controls inc': 'York',
  lennox: 'Lennox',
  daikin: 'Daikin',
  mcquay: 'Daikin',
  mitsubishi: 'Mitsubishi',
  rheem: 'Rheem',
  ruud: 'Ruud',
  goodman: 'Goodman',
  amana: 'Goodman',
  ge: 'GE',
  'general electric': 'GE',
  friedrich: 'Friedrich',
};

// Carrier RTU 2-digit unit size mapping (tons)
export const CARRIER_PKG_TONS = {
  '04': 3.0,
  '05': 4.0,
  '06': 5.0,
  '07': 6.0,
  '08': 7.5,
  '09': 8.5,
  12: 10.0,
  14: 12.5,
  16: 15.0,
  17: 15.0,
  20: 17.5,
  24: 20.0,
  28: 25.0,
  30: 27.5,
};

// Rheem packaged RTU 3-digit size mapping (tons)
export const RHEEM_PKG_TONS = {
  '024': 2.0,
  '030': 2.5,
  '036': 3.0,
  '042': 3.5,
  '048': 4.0,
  '060': 5.0,
  '073': 6.0,
  '090': 7.5,
  102: 8.5,
  120: 10.0,
  150: 12.5,
  180: 15.0,
  210: 17.5,
  240: 20.0,
};

/**
 * Normalizes raw manufacturer string to canonical ASHRAE name.
 */
export function normalizeManufacturer(mfg) {
  if (!mfg) return 'Generic';
  const cleaned = String(mfg).trim().toLowerCase();
  return MANUFACTURER_ALIASES[cleaned] || String(mfg).trim();
}

/**
 * Cleans model number by removing extraneous whitespace.
 */
export function cleanModelString(modelNumber) {
  if (!modelNumber) return '';
  return String(modelNumber).replace(/\s+/g, '').toUpperCase();
}

/**
 * Deterministic tag catcher fast-path.
 *
 * Returns an ASHRAE 205 compliant standardized equipment object,
 * or null if the model is not deterministically recognized.
 */
export function catchTag(input) {
  if (!input) return null;

  const rawMfg = input.manufacturer || input.mfg || input.brand || input.make || '';
  const rawModel = input.model_number || input.model || input.model_no || '';

  const cleanModel = cleanModelString(rawModel);
  if (!cleanModel) return null;

  const userTons = input.nominal_cooling_tons ?? input.tonnage ?? input.cooling_capacity;
  const userSeer = input.efficiency_seer ?? input.seer;

  const mfg = normalizeManufacturer(rawMfg);
  let decodedMfg = mfg !== 'Generic' ? mfg : null;
  let decodedTons = null;
  let decodedSeer = 14.0;
  let decodedClass = null;

  // 1. Carrier 48/50 Packaged RTUs: 3-digit MBH capacity code (e.g. 48HCRA060, 48TC048, 48GX036)
  const carrierMbh = cleanModel.match(
    /^(?:48|50)[A-Z0-9]{2,4}?(?:-[A-Z0-9]{1,3})?-?(0?(?:18|24|30|36|42|48|60|72|90|102|120|150|180|210|240|300|360|420|480|540|600))(?!\d)(?:[-_]?[A-Z0-9].*)?$/
  );
  if (carrierMbh) {
    decodedMfg = decodedMfg || 'Carrier';
    decodedTons = Math.round((parseInt(carrierMbh[1], 10) / 12.0) * 100) / 100;
    decodedClass = 'Unitary_RTU';
    decodedSeer = 14.0;
  }

  // 2. Carrier / Bryant / Payne Packaged RTU (48/50 series 2-digit unit size: 04=3T, 06=5T, 08=7.5T, 16=15T...)
  const carrierRtu = cleanModel.match(
    /^(?:48|50)[A-Z0-9]{2,4}?(?:-[A-Z0-9]{1,3})?-?(?:00(\d)|(\d{2}))(?!\d)(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && carrierRtu) {
    const code = carrierRtu[1] ? `0${carrierRtu[1]}` : carrierRtu[2];
    if (CARRIER_PKG_TONS[code]) {
      decodedMfg = decodedMfg || 'Carrier';
      decodedTons = CARRIER_PKG_TONS[code];
      decodedClass = 'Unitary_RTU';
      decodedSeer = 14.0;
    }
  }

  // 3. Bryant Packaged RTU Clones (580J / 581J)
  const bryantRtu = cleanModel.match(
    /^58[01]J[A-Z0-9]{0,3}?(?:-[A-Z0-9]{1,3})?-?(?:00(\d)|(\d{2}))(?!\d)(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && bryantRtu) {
    const code = bryantRtu[1] ? `0${bryantRtu[1]}` : bryantRtu[2];
    if (CARRIER_PKG_TONS[code]) {
      decodedMfg = decodedMfg || 'Carrier';
      decodedTons = CARRIER_PKG_TONS[code];
      decodedClass = 'Unitary_RTU';
      decodedSeer = 14.0;
    }
  }

  // 4. Carrier 24-series Splits
  const carrier24 = cleanModel.match(
    /^24[A-Z]{3,4}?\d?-?(18|24|30|36|42|48|60)(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && carrier24) {
    decodedMfg = decodedMfg || 'Carrier';
    decodedTons = Math.round((parseInt(carrier24[1], 10) / 12.0) * 100) / 100;
    decodedClass = 'Split_System';
    decodedSeer = 14.0;
  }

  // 5. Carrier 38-series Condensing Units / Splits
  const carrier38 = cleanModel.match(
    /^38[A-Z0-9]{2,4}?-?(0?(?:18|24|30|36|42|48|60|72|90|102|120|150|180|210|240|300|360|420|480|540|600))(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && carrier38) {
    decodedMfg = decodedMfg || 'Carrier';
    decodedTons = Math.round((parseInt(carrier38[1], 10) / 12.0) * 100) / 100;
    decodedClass = 'Split_System';
    decodedSeer = 14.0;
  }

  // 6. Carrier 30-series Chillers
  const carrier30 = cleanModel.match(/^30(?:RB|HX|XA|XW)[A-Z0-9\-_]*?(\d{3})(?:[-_]?[A-Z0-9].*)?$/);
  if (!decodedClass && carrier30) {
    const tons = parseFloat(carrier30[1]);
    if (tons >= 10.0 && tons <= 150.0) {
      decodedMfg = decodedMfg || 'Carrier';
      decodedTons = tons;
      decodedClass = 'Chiller';
      decodedSeer = null;
    }
  }

  // 7. Trane Y-series RTU (YCD, YCH, YZC, YHC, YSC)
  const traneY = cleanModel.match(
    /^Y[A-Z0-9]{2,3}?-?(0?(?:18|24|30|36|42|48|60|72|90|102|120|150|180|210|240|300|360|420|480|540|600))(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && traneY) {
    decodedMfg = decodedMfg || 'Trane';
    decodedTons = Math.round((parseInt(traneY[1], 10) / 12.0) * 100) / 100;
    decodedClass = 'Unitary_RTU';
    decodedSeer = 14.0;
  }

  // 8. Trane 4-series Split (4TTR, 4TTX, 4TWX)
  const trane4 = cleanModel.match(
    /^4[A-Z0-9]{3}?-?(\d)?(0?(?:18|24|30|36|42|48|60|72|90|102|120|150|180|210|240|300|360|420|480|540|600))(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && trane4) {
    decodedMfg = decodedMfg || 'Trane';
    const seerDigit = trane4[1];
    decodedSeer = ['3', '4', '5', '6', '7', '8'].includes(seerDigit)
      ? parseFloat(`1${seerDigit}`)
      : 14.0;
    decodedTons = Math.round((parseInt(trane4[2], 10) / 12.0) * 100) / 100;
    decodedClass = 'Split_System';
  }

  // 9. Trane Chillers (Series R RTAA/B/C/D, CGAM)
  const traneChiller = cleanModel.match(
    /^(?:RTA[A-D]|CGAM)[A-Z0-9\-_]*?(\d{2,3})(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && traneChiller) {
    const tons = parseFloat(traneChiller[1]);
    if (tons >= 10.0 && tons <= 150.0) {
      decodedMfg = decodedMfg || 'Trane';
      decodedTons = tons;
      decodedClass = 'Chiller';
      decodedSeer = null;
    }
  }

  // 10. Lennox Packaged RTU (LGH, LCH, KGB, KCB, KCC, KHA)
  const lennoxRtu = cleanModel.match(
    /^(?:LGH|LCH|KGB|KCB|KCC|KHA)[A-Z0-9\-_]*?(0?(?:18|24|30|36|42|48|60|72|90|102|120|150|180|210|240|300|360|420|480|540|600))(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && lennoxRtu) {
    decodedMfg = decodedMfg || 'Lennox';
    decodedTons = Math.round((parseInt(lennoxRtu[1], 10) / 12.0) * 100) / 100;
    decodedClass = 'Unitary_RTU';
    decodedSeer = 14.0;
  }

  // 11. York RTU (ZH, ZF, ZR, ZJ Sun Choice / Predator)
  const yorkRtu = cleanModel.match(
    /^Z[A-Z0-9]{1,3}?-?(0?(?:18|24|30|36|42|48|60|72|90|102|120|150|180|210|240|300|360|420|480|540|600))(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && yorkRtu) {
    decodedMfg = decodedMfg || 'York';
    decodedTons = Math.round((parseInt(yorkRtu[1], 10) / 12.0) * 100) / 100;
    decodedClass = 'Unitary_RTU';
    decodedSeer = 14.0;
  }

  // 12. York Chillers (YPAL, YPCL, YLAA, YVAA)
  const yorkChiller = cleanModel.match(
    /^Y(?:P[AC]L|LAA|VAA)[A-Z0-9\-_]*?(\d{2,3})(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && yorkChiller) {
    const tons = parseFloat(yorkChiller[1]);
    if (tons >= 10.0 && tons <= 150.0) {
      decodedMfg = decodedMfg || 'York';
      decodedTons = tons;
      decodedClass = 'Chiller';
      decodedSeer = null;
    }
  }

  // 13. Daikin RoofPak Commercial RTU (RPS, RDT, RFS, RCS)
  const daikinRtu = cleanModel.match(
    /^(?:RCS|RDT|RFS|RPS)[A-Z0-9\-_]*?(\d{3})(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && daikinRtu) {
    const tons = parseFloat(daikinRtu[1]);
    if (tons >= 15.0 && tons <= 150.0) {
      decodedMfg = decodedMfg || 'Daikin';
      decodedTons = tons;
      decodedClass = 'Unitary_RTU';
      decodedSeer = 14.0;
    }
  }

  // 14. Daikin Chillers (AGZ, AGS, AWS, WGZ)
  const daikinChiller = cleanModel.match(
    /^(?:AGZ|AGS|AWS|WGZ)[A-Z0-9\-_]*?0*(\d{2,3})(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && daikinChiller) {
    const tons = parseFloat(daikinChiller[1]);
    if (tons >= 10.0 && tons <= 150.0) {
      decodedMfg = decodedMfg || 'Daikin';
      decodedTons = tons;
      decodedClass = 'Chiller';
      decodedSeer = null;
    }
  }

  // 15. Daikin Ductless / Splits (FTXS, FTKS, RXS, DXS)
  const daikinDuctless = cleanModel.match(
    /^(?:FTXS?|FTKS?|RXS|DXS)[A-Z0-9\-_]*?(\d{2})(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && daikinDuctless) {
    const kbtu = parseInt(daikinDuctless[1], 10);
    if (kbtu >= 7 && kbtu <= 36) {
      decodedMfg = decodedMfg || 'Daikin';
      decodedTons = Math.round((kbtu / 12.0) * 100) / 100;
      decodedClass = 'Split_System';
      decodedSeer = 16.0;
    }
  }

  // 16. Goodman / Amana Packaged Units (GPC, GPG, GPH)
  const goodmanPkg = cleanModel.match(/^GP[CGH](\d{2})(\d{2})(?:[-_]?[A-Z0-9].*)?$/);
  if (!decodedClass && goodmanPkg) {
    const seerVal = parseFloat(goodmanPkg[1]);
    const capVal = goodmanPkg[2];
    if (['18', '24', '30', '36', '42', '48', '60'].includes(capVal)) {
      decodedMfg = decodedMfg || 'Goodman';
      decodedTons = Math.round((parseInt(capVal, 10) / 12.0) * 100) / 100;
      decodedClass = 'Unitary_RTU';
      decodedSeer = seerVal >= 10.0 && seerVal <= 40.0 ? seerVal : 14.0;
    }
  }

  // 17. Goodman / Amana Splits (GSX, DSX, GSZ, ARUF)
  const goodmanSplit = cleanModel.match(
    /^(?:GSX[CN]?|DSX[CN]?|GSZ[CN]?|ARUF|GMSS?|GME)\d{0,2}?(\d{2})?-?(0?(?:18|24|30|36|42|48|60|72|90|102|120|150|180|210|240|300|360|420|480|540|600))(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && goodmanSplit) {
    decodedMfg = decodedMfg || 'Goodman';
    const seerCand = goodmanSplit[1];
    if (seerCand && parseInt(seerCand, 10) >= 13 && parseInt(seerCand, 10) <= 22) {
      decodedSeer = parseFloat(seerCand);
    } else {
      decodedSeer = 14.0;
    }
    decodedTons = Math.round((parseInt(goodmanSplit[2], 10) / 12.0) * 100) / 100;
    decodedClass = 'Split_System';
  }

  // 18. Rheem / Ruud Commercial Packaged Units (RKNL, RLNL, RKKL, RJNL, RHNL)
  const rheemRtu = cleanModel.match(/^R[A-Z]{2}L-?[A-Z]?(\d{3})(?:[-_]?[A-Z0-9].*)?$/);
  if (!decodedClass && rheemRtu && RHEEM_PKG_TONS[rheemRtu[1]]) {
    decodedMfg = decodedMfg || 'Rheem';
    decodedTons = RHEEM_PKG_TONS[rheemRtu[1]];
    decodedClass = 'Unitary_RTU';
    decodedSeer = 14.0;
  }

  // 19. Friedrich PTAC (PDH, PDE, PZH)
  const friedrichPtac = cleanModel.match(/^P[DZ][HE][A-Z0-9\-_]*?(\d{2})(?:[-_]?[A-Z0-9].*)?$/);
  if (!decodedClass && friedrichPtac) {
    const kbtu = parseInt(friedrichPtac[1], 10);
    if (kbtu >= 7 && kbtu <= 24) {
      decodedMfg = decodedMfg || 'Friedrich';
      decodedTons = Math.round((kbtu / 12.0) * 100) / 100;
      decodedClass = 'PTAC';
      decodedSeer = 14.0;
    }
  }

  // 20. Amana PTAC (PTC, PTH)
  const amanaPtac = cleanModel.match(/^PT[CH][A-Z0-9\-_]*?(\d{2})(?:[-_]?[A-Z0-9].*)?$/);
  if (!decodedClass && amanaPtac) {
    const kbtu = parseInt(amanaPtac[1], 10);
    if (kbtu >= 7 && kbtu <= 18) {
      decodedMfg = decodedMfg || 'Goodman';
      decodedTons = Math.round((kbtu / 12.0) * 100) / 100;
      decodedClass = 'PTAC';
      decodedSeer = 14.0;
    }
  }

  // 21. GE Zoneline PTAC (AZ)
  const gePtac = cleanModel.match(
    /^AZ(?:\d{2}[A-Z]|[A-Z]{2})?[A-Z0-9\-_]*?(\d{2})(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && gePtac) {
    const kbtu = parseInt(gePtac[1], 10);
    if (kbtu >= 7 && kbtu <= 18) {
      decodedMfg = decodedMfg || 'GE';
      decodedTons = Math.round((kbtu / 12.0) * 100) / 100;
      decodedClass = 'PTAC';
      decodedSeer = 14.0;
    }
  }

  // 22. Mitsubishi Ductless (MSZ, MUZ) & VRF (PURY, PUHY, PUMY)
  const mitsM = cleanModel.match(/^M[SU]?Z-?[A-Z0-9]{2}?-?(\d{2})(?:[-_]?[A-Z0-9].*)?$/);
  if (!decodedClass && mitsM) {
    const kbtu = parseInt(mitsM[1], 10);
    if (kbtu >= 6 && kbtu <= 36) {
      decodedMfg = decodedMfg || 'Mitsubishi';
      decodedTons = Math.round((kbtu / 12.0) * 100) / 100;
      decodedClass = 'Split_System';
      decodedSeer = 16.0;
    }
  }

  const mitsVrf = cleanModel.match(
    /^P(?:URY|UHY|UMY)[A-Z0-9\-_]*?(0?(?:18|24|30|36|42|48|60|72|90|102|120|150|180|210|240|300|360|420|480|540|600))(?:[-_]?[A-Z0-9].*)?$/
  );
  if (!decodedClass && mitsVrf) {
    decodedMfg = decodedMfg || 'Mitsubishi';
    decodedTons = Math.round((parseInt(mitsVrf[1], 10) / 12.0) * 100) / 100;
    decodedClass = 'Split_System';
    decodedSeer = 14.0;
  }

  // 23. AAON RTU (RN, RQ, RL)
  const aaonRtu = cleanModel.match(/^(?:RN|RQ|RL)-?(\d{3})(?:[-_]?[A-Z0-9].*)?$/);
  if (!decodedClass && aaonRtu) {
    const tons = parseFloat(aaonRtu[1]);
    if (tons >= 5.0 && tons <= 150.0) {
      decodedMfg = decodedMfg || 'AAON';
      decodedTons = tons;
      decodedClass = 'Unitary_RTU';
      decodedSeer = 14.0;
    }
  }

  // 24. Generic HVAC MBH cluster fallback if manufacturer is known
  if (!decodedClass && decodedMfg) {
    const searchModel = /^(?:24|48|50)[A-Z]/.test(cleanModel)
      ? cleanModel.replace(/^(?:24|48|50)/, '')
      : cleanModel;
    const genericMatch = searchModel.match(
      /(?<!\d)(0?(?:18|24|30|36|42|48|60|72|90|102|120|150|180|210|240|300|360|420|480|540|600))(?!\d)/
    );
    if (genericMatch) {
      const clusterVal = parseInt(genericMatch[1], 10);
      decodedTons = Math.round((clusterVal / 12.0) * 100) / 100;
      decodedClass = 'Unitary_RTU';
      decodedSeer = 14.0;
    }
  }

  // Explicit user-provided override validation (only applies when is_manual_override is true or user_override_tons provided)
  const explicitTons =
    input.user_override_tons ?? (input.is_manual_override ? userTons : undefined);
  if (explicitTons !== undefined && explicitTons !== null && explicitTons !== '') {
    const parsedTons = parseFloat(String(explicitTons).split(/\s+/)[0]);
    if (!Number.isNaN(parsedTons) && parsedTons > 0 && parsedTons <= 150.0) {
      decodedTons = parsedTons;
    }
  }

  if (
    userSeer !== undefined &&
    userSeer !== null &&
    userSeer !== '' &&
    decodedClass !== 'Chiller'
  ) {
    const parsedSeer = parseFloat(String(userSeer).split(/\s+/)[0]);
    if (!Number.isNaN(parsedSeer) && parsedSeer >= 10.0 && parsedSeer <= 40.0) {
      decodedSeer = parsedSeer;
    }
  }

  if (!decodedClass || decodedTons === null || decodedTons <= 0 || decodedTons > 150.0) {
    return null;
  }

  const finalMfg = normalizeManufacturer(decodedMfg || 'Generic');

  return {
    manufacturer: finalMfg,
    model_number: cleanModel,
    ashrae_205_class: decodedClass,
    nominal_cooling_tons: decodedTons,
    efficiency_seer: decodedSeer,
    requires_human_audit: false,
  };
}

/**
 * Convenience helper to check if an input is resolvable by the fast-path.
 */
export function isFastPathCandidate(input) {
  return catchTag(input) !== null;
}

/**
 * Validates whether a model number conforms to standard HVAC alphanumeric patterns.
 */
export function validateModelNumber(modelNumber) {
  if (!modelNumber || typeof modelNumber !== 'string') return false;
  const clean = modelNumber.replace(/[`\s]/g, '');
  return /^[A-Z0-9\-_./]{3,40}$/i.test(clean);
}

/**
 * Validates whether a serial number conforms to standard alphanumeric HVAC serial formats.
 */
export function validateSerialNumber(serialNumber) {
  if (!serialNumber || typeof serialNumber !== 'string') return false;
  const clean = serialNumber.replace(/[`\s]/g, '');
  return /^[A-Z0-9\-_]{5,35}$/i.test(clean);
}

/**
 * Strips markdown ticks, styling asterisks, and hallucinated tokens.
 */
export function sanitizeTokenString(val) {
  if (!val) return '';
  return String(val)
    .replace(/[`*~_#]/g, '')
    .replace(/^(?:model|s\/?n|serial|brand|mfg)\s*[:#-]\s*/i, '')
    .replace(/\[(?:unreadable|damaged|weathered|none|n\/a)\]/gi, '')
    .trim();
}
