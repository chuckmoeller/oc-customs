import React, { useState, useEffect } from 'react';

// HVAC equipment categories and subcategories
const CATEGORIES = {
  'Rooftop Unit': [
    'Single Zone',
    'Multi-Zone',
    'VAV',
    'Constant Volume',
    'Heat Pump',
    'Gas/Electric',
  ],
  'Split System': ['Air Handler', 'Condensing Unit', 'Heat Pump', 'Mini-Split', 'Multi-Split'],
  Chiller: ['Air-Cooled', 'Water-Cooled', 'Scroll', 'Screw', 'Centrifugal', 'Absorption'],
  Boiler: ['Hot Water', 'Steam', 'Condensing', 'Non-Condensing', 'Electric'],
  'Air Handler': ['Central Station', 'Fan Coil', 'DOAS', 'Energy Recovery', 'Make-Up Air'],
  Condenser: ['Air-Cooled', 'Water-Cooled', 'Evaporative'],
  'Cooling Tower': ['Crossflow', 'Counterflow', 'Induced Draft', 'Forced Draft'],
  'Walk-In Cooler': ['Cooler', 'Freezer', 'Combo Cooler/Freezer', 'Blast Chiller', 'Unit Cooler'],
  'Walk-In Freezer': ['Low Temp', 'Medium Temp', 'Blast Freezer', 'Quick Freeze'],
  'Reach-In Cooler': [
    'Single Door',
    'Double Door',
    'Triple Door',
    'Glass Door',
    'Pass-Through',
    'Refrigerator with Glass Doors',
    'Display Refrigerator',
    'Thermostat',
  ],
  'Reach-In Freezer': [
    'Single Door',
    'Double Door',
    'Triple Door',
    'Glass Door',
    'Chest',
    'Freezer with Glass Doors',
    'Thermostat',
  ],
  'Refrigerated Case': [
    'Open Multi-Deck',
    'Closed Multi-Deck',
    'Deli Case',
    'Bakery Case',
    'Produce Case',
    'Meat Case',
    'Dairy Case',
    'Frozen Food Case',
    'Island Case',
  ],
  'Ice Machine': ['Cube', 'Flake', 'Nugget', 'Undercounter', 'Modular Head', 'Dispenser'],
  'Condensing Unit (Refrigeration)': [
    'Air-Cooled',
    'Water-Cooled',
    'Remote',
    'Roof-Mount',
    'Low Temp',
    'Medium Temp',
  ],
  'Evaporator Coil (Refrigeration)': [
    'Unit Cooler',
    'Low Profile',
    'Dual Discharge',
    'Center Mount',
    'Penthouse',
  ],
  'Refrigeration Rack': ['Multiplex', 'Single Compressor', 'Parallel', 'Booster'],
  'Cold Storage Room': [
    'Cooler Room',
    'Freezer Room',
    'Controlled Atmosphere',
    'Ante-Room',
    'Loading Dock',
  ],
  'Prep Table': ['Refrigerated', 'Freezer', 'Pizza Prep', 'Sandwich Prep', 'Salad Bar'],
  Pump: ['Chilled Water', 'Hot Water', 'Condenser Water', 'Booster', 'Glycol'],
  Fan: ['Supply', 'Return', 'Exhaust', 'Kitchen Hood'],
  'VRF/VRV': ['Outdoor Unit', 'Indoor Unit', 'Branch Controller'],
  Controls: [
    'Thermostat',
    'BAS Controller',
    'Sensor',
    'Actuator',
    'VFD',
    'Defrost Controller',
    'Case Controller',
  ],
  Electrical: ['Panel', 'Transformer', 'Disconnect', 'Generator', 'UPS'],
  Plumbing: ['Water Heater', 'Tankless', 'Storage Tank', 'Expansion Tank'],
  Other: ['Other'],
};

/**
 * Displays the AI analysis result with editable fields for review before saving.
 */
export default function ScanResult({ imageBase64, analysis, saving, onSave, onRetry, onDiscard }) {
  // Editable fields pre-populated from AI analysis
  const [deviceName, setDeviceName] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [voltage, setVoltage] = useState('');
  const [tonnage, setTonnage] = useState('');
  const [originalTonnage, setOriginalTonnage] = useState('');
  const [tonnageOverride, setTonnageOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [compressorRLA, setCompressorRLA] = useState('');
  const [compressorPH, setCompressorPH] = useState('');
  const [fanRLA, setFanRLA] = useState('');
  const [fanPH, setFanPH] = useState('');
  const [fanCount, setFanCount] = useState('');
  const [evaporatorCount, setEvaporatorCount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [aoe, setAoe] = useState('');
  const [notes, setNotes] = useState('');
  const [showRawJSON, setShowRawJSON] = useState(false);

  // Pre-populate from AI analysis
  useEffect(() => {
    if (!analysis || typeof analysis === 'string') return;
    const extractField = (keys) => {
      for (const key of keys) {
        if (analysis[key] !== undefined && analysis[key] !== null && String(analysis[key]).trim() !== '') {
          return String(analysis[key]).trim();
        }
      }
      return '';
    };

    setManufacturer(extractField(['manufacturer', 'mfg', 'brand', 'make', 'mfd_fab']));
    setModelNumber(extractField(['model_number', 'model_no', 'modelNumber', 'model']));
    setSerialNumber(extractField(['serial_number', 'serial_no', 'serialNumber', 'serial']));
    setVoltage(extractField(['voltage', 'volts', 'rated_voltage']));
    const rawTon = extractField(['tonnage', 'tons', 'capacity', 'size']);
    const origTon = extractField(['original_tonnage', 'originalTonnage']) || rawTon;
    setTonnage(rawTon);
    setOriginalTonnage(origTon);
    setTonnageOverride(false);
    setOverrideReason('');
    setCompressorRLA(extractField(['compressor_rla', 'compressorRLA', 'comp_rla']));
    setCompressorPH(extractField(['compressor_ph', 'phase', 'ph']));
    setFanRLA(extractField(['fan_rla', 'fanRLA', 'outdoor_fan_rla']));
    setFanPH(extractField(['fan_phases', 'fan_ph', 'fanPH', 'fanPhase', 'compressor_ph', 'phase', 'ph']));
    setFanCount(extractField(['fan_count', 'num_fans', 'number_of_fans']));
    setEvaporatorCount(extractField(['evaporator_count', 'num_evaporators']));
    setAoe(extractField(['aoe', 'area_of_effect', 'location', 'area']));
    setNotes(extractField(['notes', 'remarks']));

    // Try to auto-detect device name from model
    const model = extractField(['model_number', 'model_no', 'modelNumber', 'model']);
    const mfg = extractField(['manufacturer', 'mfg', 'brand']);
    setDeviceName(model ? `${mfg ? mfg + ' ' : ''}${model}` : '');
  }, [analysis]);

  // Get subcategories for selected category
  const subcategories = CATEGORIES[category] || [];

  // Build enriched data to pass to save
  const handleSave = () => {
    const enrichedAnalysis = {
      ...(typeof analysis === 'object' ? analysis : {}),
      // Override with user-edited values
      deviceName,
      category,
      subcategory,
      manufacturer,
      model_number: modelNumber,
      serial_number: serialNumber,
      voltage,
      tonnage,
      original_tonnage: originalTonnage || tonnage,
      tonnage_override: Boolean(
        tonnageOverride ||
        (originalTonnage && tonnage && String(tonnage).trim() !== String(originalTonnage).trim())
      ),
      override_reason: overrideReason || null,
      overridden_at:
        originalTonnage && tonnage && String(tonnage).trim() !== String(originalTonnage).trim()
          ? new Date().toISOString()
          : null,
      compressor_rla: compressorRLA,
      compressor_ph: compressorPH,
      fan_rla: fanRLA,
      fan_ph: fanPH,
      fan_phases: fanPH,
      fan_count: fanCount,
      evaporator_count: evaporatorCount,
      quantity,
      aoe,
      notes,
    };
    onSave(enrichedAnalysis);
  };

  return (
    <div className="space-y-4">
      {/* Preview image */}
      <div className="rounded-xl overflow-hidden bg-black">
        <img
          src={imageBase64}
          alt="Scanned equipment"
          className="w-full max-h-[30vh] object-contain"
        />
      </div>

      {/* Analysis status */}
      {analysis && (
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Analysis Complete — Review & Edit
          </h3>
          <button
            onClick={() => setShowRawJSON(!showRawJSON)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            {showRawJSON ? 'Hide' : 'Show'} Raw JSON
          </button>
        </div>
      )}

      {/* Raw JSON toggle */}
      {showRawJSON && analysis && (
        <div className="bg-gray-50 rounded-lg p-3 overflow-auto max-h-[20vh] border border-gray-200">
          <pre className="text-xs text-gray-600 whitespace-pre-wrap">
            {typeof analysis === 'string' ? analysis : JSON.stringify(analysis, null, 2)}
          </pre>
        </div>
      )}

      {/* Editable fields */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        {/* Device Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Device Name</label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="e.g. Trane RTU-1"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        {/* Category & Subcategory */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSubcategory('');
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
            >
              <option value="">Select category...</option>
              {Object.keys(CATEGORIES).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
            <select
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              disabled={!category}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">Select subcategory...</option>
              {subcategories.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Manufacturer */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
          <input
            type="text"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            placeholder="e.g. Trane, Carrier, Lennox"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        {/* Model & Serial */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model #</label>
            <input
              type="text"
              value={modelNumber}
              onChange={(e) => setModelNumber(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Serial #</label>
            <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Voltage & Tonnage */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Voltage</label>
            <input
              type="text"
              value={voltage}
              onChange={(e) => setVoltage(e.target.value)}
              placeholder="e.g. 460/60/3"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Tonnage</label>
              {(tonnageOverride ||
                (originalTonnage &&
                  tonnage &&
                  String(tonnage).trim() !== String(originalTonnage).trim())) && (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">
                  Overridden (Orig: {originalTonnage}T)
                </span>
              )}
            </div>
            <input
              type="text"
              value={tonnage}
              onChange={(e) => {
                const val = e.target.value;
                setTonnage(val);
                if (originalTonnage && String(val).trim() !== String(originalTonnage).trim()) {
                  setTonnageOverride(true);
                } else if (!val || String(val).trim() === String(originalTonnage).trim()) {
                  setTonnageOverride(false);
                }
              }}
              placeholder="e.g. 10"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            {(tonnageOverride ||
              (originalTonnage &&
                tonnage &&
                String(tonnage).trim() !== String(originalTonnage).trim())) && (
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason (e.g. nameplate glare, verified via compressor)"
                className="mt-1.5 w-full bg-amber-50/50 border border-amber-300 rounded px-2 py-1 text-xs text-amber-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            )}
          </div>
        </div>

        {/* Compressor RLA & PH */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Compressor RLA</label>
            <input
              type="text"
              value={compressorRLA}
              onChange={(e) => setCompressorRLA(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Compressor PH</label>
            <input
              type="text"
              value={compressorPH}
              onChange={(e) => setCompressorPH(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Fan RLA & PH */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fan RLA</label>
            <input
              type="text"
              value={fanRLA}
              onChange={(e) => setFanRLA(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fan PH</label>
            <input
              type="text"
              value={fanPH}
              onChange={(e) => setFanPH(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Fan Count & Evaporator Count */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1"># of Fans</label>
            <input
              type="number"
              value={fanCount}
              onChange={(e) => setFanCount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1"># of Evaporators</label>
            <input
              type="number"
              value={evaporatorCount}
              onChange={(e) => setEvaporatorCount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Quantity & AoE */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              AoE (Area of Equipment)
            </label>
            <input
              type="text"
              value={aoe}
              onChange={(e) => setAoe(e.target.value)}
              placeholder="e.g. Roof, Mech Room, Kitchen"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Additional notes..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-green-600 text-white rounded-lg px-4 py-3 font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save to Job'}
        </button>
        <button
          onClick={onRetry}
          disabled={saving}
          className="px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Retry
        </button>
        <button
          onClick={onDiscard}
          disabled={saving}
          className="px-4 py-3 bg-white border border-red-200 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
