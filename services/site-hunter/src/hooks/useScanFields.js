import { useState, useCallback } from 'react';

export function useScanFields({ stopCamera }) {
  const [imageBase64, setImageBase64] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisProvider, setAnalysisProvider] = useState(null);
  const [deviceName, setDeviceName] = useState('');
  // 3-axis taxonomy "Type" (Gas/Electric, Heat Pump, …). Free-text, scan-derived
  // (from analysis equipment_type), editable in ResultView. Firestore-only.
  const [equipmentType, setEquipmentType] = useState('');
  // Precise equipment class preserved when subcategory collapses to "Other"
  // (a class with no Submission Form 3.0 dropdown value). Keeps Firebase complete.
  const [subcategoryDetail, setSubcategoryDetail] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [voltage, setVoltage] = useState('');
  const [tonnage, setTonnage] = useState('');
  const [originalTonnage, setOriginalTonnage] = useState('');
  const [tonnageOverride, setTonnageOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overriddenAt, setOverriddenAt] = useState(null);
  const [compressorCount, setCompressorCount] = useState('');
  const [compressorHP, setCompressorHP] = useState('');
  const [compressorRLA, setCompressorRLA] = useState('');
  const [compressorRLAEstimated, setCompressorRLAEstimated] = useState(false);
  const [compressorLRA, setCompressorLRA] = useState('');
  const [compressorPH, setCompressorPH] = useState('');
  const [mca, setMca] = useState('');
  const [mocp, setMocp] = useState('');
  const [fanRLA, setFanRLA] = useState('');
  const [fanPH, setFanPH] = useState('');
  const [fanCount, setFanCount] = useState('');
  const [evaporatorCount, setEvaporatorCount] = useState('');
  const [motorType, setMotorType] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [aoe, setAoe] = useState('');
  const [mfgYear, setMfgYear] = useState(null);
  const [mfgYearSource, setMfgYearSource] = useState(null);
  const [age, setAge] = useState(null);
  const [scanMissingFields, setScanMissingFields] = useState([]);
  const [energyStar, setEnergyStar] = useState(null);
  const [energyStarLoading, setEnergyStarLoading] = useState(false);
  const [seer, setSeer] = useState('');
  const [eer, setEer] = useState('');
  // Chiller efficiency (Integrated Part-Load Value) — the chiller analog of SEER.
  const [iplv, setIplv] = useState('');
  const [weight, setWeight] = useState('');
  const [refrigerantType, setRefrigerantType] = useState('');
  const [refrigerantCharge, setRefrigerantCharge] = useState('');
  const [oilType, setOilType] = useState('');
  const [designPressureHigh, setDesignPressureHigh] = useState('');
  const [designPressureLow, setDesignPressureLow] = useState('');
  const [ahriNumber, setAhriNumber] = useState('');
  const [fanFla, setFanFla] = useState('');
  const [notes, setNotes] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [showRawJSON, setShowRawJSON] = useState(false);
  const [enrichment, setEnrichment] = useState(null);
  const [groundingLoading, setGroundingLoading] = useState(false);
  const [scanTime, setScanTime] = useState(null);
  const [savedScanData, setSavedScanData] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const reset = useCallback(() => {
    setImageBase64(null);
    setAnalysis(null);
    setAnalysisProvider(null);
    setDeviceName('');
    setEquipmentType('');
    setSubcategoryDetail('');
    setManufacturer('');
    setModelNumber('');
    setSerialNumber('');
    setVoltage('');
    setTonnage('');
    setOriginalTonnage('');
    setTonnageOverride(false);
    setOverrideReason('');
    setOverriddenAt(null);
    setCompressorCount('');
    setCompressorHP('');
    setCompressorRLA('');
    setCompressorRLAEstimated(false);
    setCompressorLRA('');
    setCompressorPH('');
    setMca('');
    setMocp('');
    setFanRLA('');
    setFanPH('');
    setFanCount('');
    setEvaporatorCount('');
    setMotorType('');
    setQuantity('1');
    setAoe('');
    setMfgYear(null);
    setMfgYearSource(null);
    setScanMissingFields([]);
    setEnergyStar(null);
    setEnergyStarLoading(false);
    setSeer('');
    setEer('');
    setIplv('');
    setWeight('');
    setRefrigerantType('');
    setRefrigerantCharge('');
    setOilType('');
    setDesignPressureHigh('');
    setDesignPressureLow('');
    setAhriNumber('');
    setFanFla('');
    setNotes('');
    setManualUrl('');
    setShowRawJSON(false);
    setEnrichment(null);
    setGroundingLoading(false);
    setScanTime(null);
    setSavedScanData(null);
    setSyncing(false);
    stopCamera();
  }, [stopCamera]);

  return {
    imageBase64,
    setImageBase64,
    analysis,
    setAnalysis,
    analysisProvider,
    setAnalysisProvider,
    deviceName,
    setDeviceName,
    equipmentType,
    setEquipmentType,
    subcategoryDetail,
    setSubcategoryDetail,
    manufacturer,
    setManufacturer,
    modelNumber,
    setModelNumber,
    serialNumber,
    setSerialNumber,
    voltage,
    setVoltage,
    tonnage,
    setTonnage,
    originalTonnage,
    setOriginalTonnage,
    tonnageOverride,
    setTonnageOverride,
    overrideReason,
    setOverrideReason,
    overriddenAt,
    setOverriddenAt,
    compressorCount,
    setCompressorCount,
    compressorHP,
    setCompressorHP,
    compressorRLA,
    setCompressorRLA,
    compressorRLAEstimated,
    setCompressorRLAEstimated,
    compressorLRA,
    setCompressorLRA,
    compressorPH,
    setCompressorPH,
    mca,
    setMca,
    mocp,
    setMocp,
    fanRLA,
    setFanRLA,
    fanPH,
    setFanPH,
    fanCount,
    setFanCount,
    evaporatorCount,
    setEvaporatorCount,
    motorType,
    setMotorType,
    quantity,
    setQuantity,
    aoe,
    setAoe,
    mfgYear,
    setMfgYear,
    mfgYearSource,
    setMfgYearSource,
    age,
    setAge,
    scanMissingFields,
    setScanMissingFields,
    energyStar,
    setEnergyStar,
    energyStarLoading,
    setEnergyStarLoading,
    seer,
    setSeer,
    eer,
    setEer,
    iplv,
    setIplv,
    weight,
    setWeight,
    refrigerantType,
    setRefrigerantType,
    refrigerantCharge,
    setRefrigerantCharge,
    oilType,
    setOilType,
    designPressureHigh,
    setDesignPressureHigh,
    designPressureLow,
    setDesignPressureLow,
    ahriNumber,
    setAhriNumber,
    fanFla,
    setFanFla,
    notes,
    setNotes,
    manualUrl,
    setManualUrl,
    showRawJSON,
    setShowRawJSON,
    enrichment,
    setEnrichment,
    groundingLoading,
    setGroundingLoading,
    scanTime,
    setScanTime,
    savedScanData,
    setSavedScanData,
    syncing,
    setSyncing,
    reset,
  };
}
