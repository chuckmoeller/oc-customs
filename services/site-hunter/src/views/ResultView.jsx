import { memo } from 'react';
function ResultView({ fields, setters, ...otherProps }) {
  const {
    deviceName,
    equipmentType,
    manufacturer,
    modelNumber,
    serialNumber,
    voltage,
    tonnage,
    originalTonnage,
    tonnageOverride,
    overrideReason,
    overriddenAt,
    compressorCount,
    compressorHP,
    compressorRLA,
    compressorRLAEstimated,
    compressorLRA,
    compressorPH,
    mca,
    mocp,
    fanRLA,
    fanPH,
    fanCount,
    evaporatorCount,
    motorType,
    quantity,
    aoe,
    seer,
    eer,
    iplv,
    weight,
    refrigerantType,
    refrigerantCharge,
    oilType,
    designPressureHigh,
    designPressureLow,
    ahriNumber,
    fanFla,
    notes,
  } = fields;
  const {
    setDeviceName,
    setEquipmentType,
    setManufacturer,
    setModelNumber,
    setSerialNumber,
    setVoltage,
    setTonnage,
    setOriginalTonnage,
    setTonnageOverride,
    setOverrideReason,
    setOverriddenAt,
    setCompressorCount,
    setCompressorHP,
    setCompressorRLA,
    setCompressorRLAEstimated,
    setCompressorLRA,
    setCompressorPH,
    setMca,
    setMocp,
    setFanRLA,
    setFanPH,
    setFanCount,
    setEvaporatorCount,
    setMotorType,
    setQuantity,
    setAoe,
    setSeer,
    setEer,
    setIplv,
    setWeight,
    setRefrigerantType,
    setRefrigerantCharge,
    setOilType,
    setDesignPressureHigh,
    setDesignPressureLow,
    setAhriNumber,
    setFanFla,
    setNotes,
  } = setters;
  const {
    imageBase64,
    analysis,
    scanTime,
    groundingLoading,
    saving,
    showRawJSON,
    setShowRawJSON,
    mfgYear,
    mfgYearSource,
    age,
    energyStar,
    energyStarLoading,
    scanMissingFields: _scanMissingFields,
    category,
    setCategory,
    subcategory,
    setSubcategory,
    subcategoryDetail,
    categoryOptions,
    subcategoryOptions,
    isAsanaMode,
    asanaSections,
    selectedCategoryItem: _selectedCategoryItem,
    setSelectedCategoryItem,
    jobNumber,
    jobName,
    onSave,
    onReset,
    onLookupModel,
    lookupLoading,
    lookupError,
    onGetRecommendations,
    recLoading,
    recStatus,
    recError,
    recommendations,
    requiresReview,
    inputClass,
    selectClass,
    labelClass,
    fieldBadge,
    enrichment,
    setEnrichment: _setEnrichment,
    nameplateLabel,
    setNameplateLabel,
  } = otherProps;

  return (
    <div className="space-y-4">
      {/* Job context reminder */}
      {(jobNumber || jobName) && (
        <div className="bg-green-900/30 border border-green-700 rounded-lg px-4 py-2 text-sm text-green-300 flex items-center gap-2">
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5"
            />
          </svg>
          <span>
            <strong>{jobNumber}</strong>
            {jobName ? ` — ${jobName}` : ''} → {category}
            {subcategory ? ` / ${subcategory}` : ''}
          </span>
        </div>
      )}

      {/* Image preview with number label */}
      {imageBase64 && (
        <div className="rounded-xl overflow-hidden bg-black relative">
          <img
            src={imageBase64}
            alt="Scanned equipment"
            className="w-full max-h-[30vh] object-contain"
          />
          <div className="absolute top-3 left-3 bg-[#67986A] text-white rounded-lg px-3 py-1.5 font-bold text-lg shadow-lg">
            1 {nameplateLabel && <span className="text-sm font-normal">- {nameplateLabel}</span>}
          </div>
        </div>
      )}

      {/* Nameplate Label - PROMINENT */}
      <div className="bg-amber-900/30 border-2 border-amber-600 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className="bg-[#67986A] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
            1
          </div>
          <label className="font-semibold text-amber-300">
            Nameplate Label (Optional but Recommended)
          </label>
        </div>
        <input
          type="text"
          value={nameplateLabel}
          onChange={(e) => setNameplateLabel(e.target.value)}
          placeholder="e.g. Main RTU, Rooftop Unit A, Chiller 1..."
          className={inputClass}
          autoFocus
        />
        <p className="text-xs text-amber-200">
          Give this equipment a descriptive name. This photo will be labeled as{' '}
          <strong>1{nameplateLabel ? ` - ${nameplateLabel}` : ''}</strong>. Supporting photos will
          be labeled 1a, 1b, 1c, etc.
        </p>
      </div>

      {/* Analysis header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-100 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-[#67986A]"
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
          {groundingLoading && (
            <span className="text-xs text-blue-400 font-normal flex items-center gap-1">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              searching web...
            </span>
          )}
        </h3>
        <div className="flex items-center gap-3">
          {scanTime && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {scanTime}s
            </span>
          )}
          <button
            onClick={() => setShowRawJSON(!showRawJSON)}
            className="text-xs text-gray-400 hover:text-gray-300"
          >
            {showRawJSON ? 'Hide' : 'Show'} Raw JSON
          </button>
        </div>
      </div>

      {showRawJSON && analysis && (
        <div className="bg-gray-800 rounded-lg p-3 overflow-auto max-h-[20vh] border border-gray-700">
          <pre className="text-xs text-gray-300 whitespace-pre-wrap">
            {typeof analysis === 'string' ? analysis : JSON.stringify(analysis, null, 2)}
          </pre>
        </div>
      )}

      {/* Enrichment sources */}
      {enrichment?.sources?.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-700 rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-semibold text-blue-300 flex items-center gap-2">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            Equipment Data Sources ({enrichment.sources.length} found)
          </h4>
          <div className="space-y-1">
            {enrichment.sources.map((src, i) => (
              <a
                key={i}
                href={src.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-[#1A2332] rounded-lg p-2 border border-blue-800 hover:border-blue-500 transition-colors"
              >
                <p className="text-sm font-medium text-blue-400 truncate">{src.title}</p>
                <p className="text-xs text-gray-500 truncate">{src.displayLink}</p>
                {src.snippet && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{src.snippet}</p>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Editable fields */}
      <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-4">
        <div>
          <label className={labelClass}>Device Name</label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="e.g. Trane RTU-1"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>
              Category {isAsanaMode && <span className="text-[#67986A] text-xs">(Asana)</span>}
            </label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSubcategory('');
                if (isAsanaMode)
                  setSelectedCategoryItem(
                    asanaSections.find((c) => c.name === e.target.value) || null
                  );
              }}
              className={selectClass}
            >
              <option value="">Select category...</option>
              {category && !categoryOptions.includes(category) && (
                <option value={category}>{category}</option>
              )}
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              Subcategory {isAsanaMode && <span className="text-[#67986A] text-xs">(tasks)</span>}
            </label>
            <select
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              disabled={!category}
              className={`${selectClass} disabled:bg-gray-800 disabled:text-gray-400`}
            >
              <option value="">Select subcategory...</option>
              {subcategory && !subcategoryOptions.includes(subcategory) && (
                <option value={subcategory}>{subcategory} (auto-detected)</option>
              )}
              {subcategoryOptions.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>
        </div>

        {subcategoryDetail && (
          <p className="-mt-1 text-xs text-gray-400">
            Detected class: <span className="text-gray-300">{subcategoryDetail}</span>
          </p>
        )}

        <div>
          <label className={labelClass}>Type{fieldBadge('equipment_type', equipmentType)}</label>
          <input
            type="text"
            value={equipmentType}
            onChange={(e) => setEquipmentType(e.target.value)}
            placeholder="e.g. Gas/Electric, Heat Pump"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            Manufacturer{fieldBadge('manufacturer', manufacturer)}
          </label>
          <input
            type="text"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            placeholder="e.g. Trane, Carrier"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Model #{fieldBadge('model_number', modelNumber)}</label>
            <input
              type="text"
              value={modelNumber}
              onChange={(e) => setModelNumber(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Serial #{fieldBadge('serial_number', serialNumber)}
            </label>
            <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Manual spec lookup — for plates the camera couldn't read (e.g. chillers).
            Type the model above, then pull specs from the model number. */}
        {onLookupModel && (
          <div className="-mt-1">
            <button
              type="button"
              onClick={onLookupModel}
              disabled={lookupLoading || !modelNumber}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-blue-700 bg-blue-900/30 px-3 py-2 text-sm font-medium text-blue-300 disabled:opacity-50"
            >
              {lookupLoading ? (
                <>
                  <span className="w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                  Looking up specs…
                </>
              ) : (
                <>🔍 Look up specs by model #</>
              )}
            </button>
            {lookupError && <p className="mt-1 text-xs text-red-400">{lookupError}</p>}
          </div>
        )}

        {mfgYear && (
          <div className="flex items-center gap-2 text-xs text-gray-400 -mt-1">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span>
              Manufactured: <span className="text-gray-200 font-medium">{mfgYear}</span>
              {' · '}
              <span className="text-emerald-400 font-semibold">
                {age ?? new Date().getFullYear() - mfgYear} yrs old
              </span>
              {' · '}
              <span className="text-gray-500">
                {mfgYearSource === 'nameplate' ? 'from nameplate' : 'decoded from serial'}
              </span>
            </span>
          </div>
        )}

        {energyStarLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-500 -mt-1">
            <svg className="animate-spin h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span>Checking ENERGY STAR…</span>
          </div>
        )}

        {energyStar?.certified && (
          <div className="flex items-center gap-2 text-xs text-gray-400 -mt-1">
            <span className="text-blue-400 flex-shrink-0">★</span>
            <span>
              <span className="text-blue-300 font-medium">ENERGY STAR</span>
              {energyStar.meets_most_efficient && (
                <span className="text-blue-500"> · Most Efficient</span>
              )}
              {energyStar.seer2 && (
                <>
                  {' '}
                  · SEER2 <span className="text-gray-200 font-medium">{energyStar.seer2}</span>
                </>
              )}
              {energyStar.eer2 && (
                <>
                  {' '}
                  · EER2 <span className="text-gray-200 font-medium">{energyStar.eer2}</span>
                </>
              )}
              {energyStar.hspf2 && (
                <>
                  {' '}
                  · HSPF2 <span className="text-gray-200 font-medium">{energyStar.hspf2}</span>
                </>
              )}
              {energyStar.daily_kwh && (
                <>
                  {' '}
                  · <span className="text-gray-200 font-medium">{energyStar.daily_kwh}</span>{' '}
                  kWh/day
                </>
              )}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Voltage{fieldBadge('voltage', voltage)}</label>
            <input
              type="text"
              value={voltage}
              onChange={(e) => setVoltage(e.target.value)}
              placeholder="e.g. 460/60/3"
              className={inputClass}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass}>Tonnage{fieldBadge('tonnage', tonnage)}</label>
              {(tonnageOverride ||
                (originalTonnage &&
                  tonnage &&
                  String(tonnage).trim() !== String(originalTonnage).trim())) && (
                <span className="text-[10px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-600/50 px-1.5 py-0.5 rounded shadow-sm">
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
                  setTonnageOverride?.(true);
                  setOverriddenAt?.(new Date().toISOString());
                } else if (!val || String(val).trim() === String(originalTonnage).trim()) {
                  setTonnageOverride?.(false);
                }
              }}
              placeholder="e.g. 5"
              className={inputClass}
            />
            {(tonnageOverride ||
              (originalTonnage &&
                tonnage &&
                String(tonnage).trim() !== String(originalTonnage).trim())) && (
              <input
                type="text"
                value={overrideReason || ''}
                onChange={(e) => setOverrideReason?.(e.target.value)}
                placeholder="Reason (e.g. nameplate glare, compressor plate)"
                className="mt-1.5 w-full bg-[#111927] border border-amber-700/40 rounded px-2 py-1 text-xs text-amber-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}># Compressors</label>
            <input
              type="number"
              value={compressorCount}
              onChange={(e) => setCompressorCount(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Compressor HP</label>
            <input
              type="text"
              value={compressorHP}
              onChange={(e) => setCompressorHP(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>
              Compressor RLA{' '}
              {compressorRLAEstimated && (
                <span className="text-yellow-400 text-[10px] font-normal">(est.)</span>
              )}
            </label>
            <input
              type="text"
              value={compressorRLA}
              onChange={(e) => {
                setCompressorRLA(e.target.value);
                setCompressorRLAEstimated(false);
              }}
              className={`${inputClass} ${compressorRLAEstimated ? 'border-yellow-500/50' : ''}`}
            />
          </div>
          <div>
            <label className={labelClass}>Compressor LRA</label>
            <input
              type="text"
              value={compressorLRA}
              onChange={(e) => setCompressorLRA(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Compressor PH</label>
            <input
              type="text"
              value={compressorPH}
              onChange={(e) => setCompressorPH(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>MCA{fieldBadge('min_circuit_ampacity', mca)}</label>
            <input
              type="text"
              value={mca}
              onChange={(e) => setMca(e.target.value)}
              placeholder="Min Circuit Amps"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>MOCP{fieldBadge('max_fuse_or_breaker', mocp)}</label>
            <input
              type="text"
              value={mocp}
              onChange={(e) => setMocp(e.target.value)}
              placeholder="Max Overcurrent Protection"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>AHRI #{fieldBadge('ahri_number', ahriNumber)}</label>
            <input
              type="text"
              value={ahriNumber}
              onChange={(e) => setAhriNumber(e.target.value)}
              placeholder="Certification #"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Fan RLA</label>
            <input
              type="text"
              value={fanRLA}
              onChange={(e) => setFanRLA(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Fan PH</label>
            <input
              type="text"
              value={fanPH}
              onChange={(e) => setFanPH(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}># of Fans</label>
            <input
              type="number"
              value={fanCount}
              onChange={(e) => setFanCount(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}># of Evaporators</label>
            <input
              type="number"
              value={evaporatorCount}
              onChange={(e) => setEvaporatorCount(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Motor Type</label>
            <input
              type="text"
              value={motorType}
              onChange={(e) => setMotorType(e.target.value)}
              placeholder="e.g. PSC, ECM"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Fan FLA</label>
            <input
              type="text"
              value={fanFla}
              onChange={(e) => setFanFla(e.target.value)}
              placeholder="Full Load Amps"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>SEER</label>
            <input
              type="text"
              value={seer}
              onChange={(e) => setSeer(e.target.value)}
              placeholder="e.g. 14"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>EER</label>
            <input
              type="text"
              value={eer}
              onChange={(e) => setEer(e.target.value)}
              placeholder="e.g. 11.2"
              className={inputClass}
            />
          </div>
        </div>

        {/* IPLV — chiller efficiency (the chiller analog of SEER). Shown for
            chillers or whenever a value is present; hidden for ordinary AC. */}
        {((category || '').toLowerCase().includes('chiller') || iplv) && (
          <div>
            <label className={labelClass}>IPLV{fieldBadge('iplv', iplv)}</label>
            <input
              type="text"
              value={iplv}
              onChange={(e) => setIplv(e.target.value)}
              placeholder="Chiller efficiency, e.g. 15.4 IPLV.IP"
              className={inputClass}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Refrigerant Type</label>
            <input
              type="text"
              value={refrigerantType}
              onChange={(e) => setRefrigerantType(e.target.value)}
              placeholder="e.g. R-410A"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Refrigerant Charge</label>
            <input
              type="text"
              value={refrigerantCharge}
              onChange={(e) => setRefrigerantCharge(e.target.value)}
              placeholder="e.g. 6861g / 242 oz"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Oil Type</label>
            <input
              type="text"
              value={oilType}
              onChange={(e) => setOilType(e.target.value)}
              placeholder="e.g. POE, Mineral"
              className={inputClass}
            />
          </div>
          <div>{/* spacer */}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>
              Design Pressure High{fieldBadge('design_pressure_high', designPressureHigh)}
            </label>
            <input
              type="text"
              value={designPressureHigh}
              onChange={(e) => setDesignPressureHigh(e.target.value)}
              placeholder="e.g. 450 psig"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Design Pressure Low{fieldBadge('design_pressure_low', designPressureLow)}
            </label>
            <input
              type="text"
              value={designPressureLow}
              onChange={(e) => setDesignPressureLow(e.target.value)}
              placeholder="e.g. 235 psig"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Weight</label>
            <input
              type="text"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 350 lbs"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Quantity</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>AoE (Add On Equipment)</label>
          <input
            type="text"
            value={aoe}
            onChange={(e) => setAoe(e.target.value)}
            placeholder="e.g. Economizer, UV Light, VFD"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Additional notes..."
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>

      {/* Efficiency upgrade recommendations (site-hunter-agent-router) */}
      <div className="border-t border-gray-700 pt-4">
        <button
          type="button"
          onClick={onGetRecommendations}
          disabled={recLoading || !imageBase64}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-green-700 bg-green-900/30 px-3 py-2 text-sm font-medium text-green-300 disabled:opacity-50"
        >
          {recLoading ? (
            <>
              <span className="w-3 h-3 border-2 border-green-300 border-t-transparent rounded-full animate-spin" />
              {recStatus || 'Analyzing…'}
            </>
          ) : (
            <>⚡ Get efficiency upgrade recommendations</>
          )}
        </button>
        {recError && <p className="mt-1 text-xs text-red-400">{recError}</p>}

        {recommendations && recommendations.length > 0 && (
          <div className="mt-3 space-y-2">
            {recommendations.map((r, i) => (
              <div key={i} className="rounded-lg border border-green-700 bg-green-900/20 px-3 py-2">
                <p className="text-sm font-semibold text-green-300">{r.product}</p>
                <p className="text-xs text-gray-300 mt-0.5">{r.justification}</p>
              </div>
            ))}
          </div>
        )}
        {recommendations && recommendations.length === 0 && !recLoading && !recError && (
          <p className="mt-2 text-xs text-gray-400">
            No upgrade opportunities identified for this equipment.
          </p>
        )}
        {requiresReview && requiresReview.length > 0 && (
          <div className="mt-2 rounded-lg border border-yellow-700 bg-yellow-900/20 px-3 py-2">
            <p className="text-xs font-semibold text-yellow-300 mb-1">Verify before presenting:</p>
            <ul className="text-xs text-yellow-200 list-disc list-inside space-y-0.5">
              {requiresReview.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 bg-[#67986A] text-white rounded-lg px-4 py-3 font-medium hover:bg-[#5a8a5d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save to Job'}
        </button>
        <button
          onClick={onReset}
          disabled={saving}
          className="px-4 py-3 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          Retry
        </button>
        <button
          onClick={onReset}
          disabled={saving}
          className="px-4 py-3 bg-gray-700 border border-red-700 text-red-400 rounded-lg font-medium hover:bg-red-900/30 transition-colors disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
export default memo(ResultView);
