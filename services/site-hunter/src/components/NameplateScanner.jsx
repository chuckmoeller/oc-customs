import { useState, useMemo } from 'react';
import { submitToOrchestrator, pollJobStatus } from '../lib/orchestrator.js';
import { catchTag, validateModelNumber, sanitizeTokenString } from '../lib/tagCatcher.js';

export default function NameplateScanner({ onSimulationComplete }) {
  const [manufacturer, setManufacturer] = useState('Carrier');
  const [modelNumber, setModelNumber] = useState('48TCED08A2A5A0A0');
  const [status, setStatus] = useState('Idle');
  const [jobId, setJobId] = useState(null);
  const [result, setResult] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);

  // Instant lightweight regex validation before any network request fires
  const fastPathMatch = useMemo(() => {
    return catchTag({
      manufacturer,
      model_number: modelNumber,
    });
  }, [manufacturer, modelNumber]);

  const handleAnalyze = async (rawInput) => {
    setError(null);
    setResult(null);
    setJobId(null);

    // Pre-flight deterministic regex guardrail: intercept malformed model numbers before network transmission
    const targetModel = sanitizeTokenString(
      rawInput instanceof FormData ? '' : rawInput?.model_number || modelNumber
    );

    if (!(rawInput instanceof FormData) && targetModel && !validateModelNumber(targetModel)) {
      const validationMsg =
        'Invalid model number format. Expected alphanumeric identifier (e.g. 48TCED08A2A5A0A0).';
      setError(validationMsg);
      setStatus(`Validation Failed: ${validationMsg}`);
      return;
    }

    try {
      let ashraeData = null;

      // Check if deterministic fast-path already pre-resolves the model in-memory
      const currentFastPath =
        !(rawInput instanceof FormData) && targetModel
          ? catchTag({
              manufacturer: rawInput?.manufacturer || manufacturer,
              model_number: targetModel,
            })
          : null;

      if (currentFastPath) {
        setStatus('⚡ Fast-Path Verified (Deterministic In-Memory Pre-Grounding)...');
        ashraeData = currentFastPath;
        console.warn('Deterministic fast-path pre-grounded equipment:', ashraeData);
      } else {
        // Fall back to Gemini / Vertex AI Search Grounding
        setStatus('Normalizing ASHRAE Data via Gemini Grounding (Vertex AI Search)...');
        const groundResponse = await fetch('/api/gemini/ground', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            rawInput instanceof FormData
              ? rawInput
              : {
                  manufacturer: rawInput?.manufacturer || manufacturer,
                  model_number: rawInput?.model_number || modelNumber,
                  missingFields: ['nominal_cooling_tons', 'efficiency_seer'],
                }
          ),
        });

        if (!groundResponse.ok) {
          throw new Error(`Grounding failed with status: ${groundResponse.status}`);
        }

        const groundedData = await groundResponse.json();
        ashraeData = groundedData.fields;
        console.warn('Grounding response normalized data:', ashraeData);
      }

      // Forward standardized ASHRAE 205 data to Google Cloud Run simulation orchestrator
      setStatus('Submitting to Orchestrator on Cloud Run...');
      const simulationJob = await submitToOrchestrator({
        ashrae_data: ashraeData,
      });

      setJobId(simulationJob.job_id);

      // Poll simulation status until completion
      setStatus('Running EnergyPlus Simulation...');
      const finalResult = await pollJobStatus(simulationJob.job_id, (currentStatus) => {
        setStatus(currentStatus);
      });

      setStatus('Validation Complete');
      setResult(finalResult);
      if (onSimulationComplete) {
        onSimulationComplete(finalResult);
      }
    } catch (err) {
      console.error('Nameplate scanner analysis failed:', err);
      setError(err.message);
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md space-y-4 mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Site Hunter Nameplate Scanner</h2>
        {fastPathMatch && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
            ⚡ Fast-Path Ready
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Manufacturer / Brand
          </label>
          <input
            type="text"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            placeholder="e.g. Carrier, Trane, York, Lennox"
            className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500 text-gray-800"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Model Number (with factory suffixes)
          </label>
          <input
            type="text"
            value={modelNumber}
            onChange={(e) => setModelNumber(e.target.value)}
            placeholder="e.g. 48TCED08A2A5A0A0, YCD060C4H0AA"
            className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm font-mono focus:ring-blue-500 focus:border-blue-500 text-gray-800"
          />
        </div>

        {/* Real-time instant UI feedback from in-memory tag catcher */}
        {fastPathMatch ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs text-emerald-900 space-y-1">
            <div className="font-semibold text-emerald-800 flex items-center gap-1">
              <span>⚡ Deterministic ASHRAE 205 Pre-Grounding Match</span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[11px] pt-1">
              <div>
                <span className="text-gray-500">Class:</span>{' '}
                <strong className="text-gray-800">{fastPathMatch.ashrae_205_class}</strong>
              </div>
              <div>
                <span className="text-gray-500">Tonnage:</span>{' '}
                <strong className="text-gray-800">{fastPathMatch.nominal_cooling_tons} Tons</strong>
              </div>
              <div>
                <span className="text-gray-500">Efficiency:</span>{' '}
                <strong className="text-gray-800">
                  {fastPathMatch.efficiency_seer
                    ? `${fastPathMatch.efficiency_seer} SEER`
                    : 'N/A (Chiller)'}
                </strong>
              </div>
              <div>
                <span className="text-gray-500">Audit Req:</span>{' '}
                <strong className="text-gray-800">
                  {fastPathMatch.requires_human_audit ? 'Yes' : 'No'}
                </strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
            ℹ️ Model not matched by local fast-path. Grounding will query Vertex AI Search.
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Or Nameplate Photo (Optional)
          </label>
          <input
            type="file"
            accept="image/*,.heic,.heif,.HEIC,.HEIF"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        <button
          onClick={() =>
            handleAnalyze(
              file || {
                manufacturer,
                model_number: modelNumber,
              }
            )
          }
          disabled={status.includes('...')}
          className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 text-sm shadow-sm transition-colors"
        >
          {status.includes('...') ? status : 'Analyze & Simulate'}
        </button>
      </div>

      <div className="bg-gray-100 p-4 rounded text-sm text-gray-700">
        <p>
          <strong>Status:</strong> {status}
        </p>
        {jobId && (
          <p>
            <strong>Job ID:</strong> {jobId}
          </p>
        )}
        {error && (
          <p className="text-red-600 mt-1">
            <strong>Error:</strong> {error}
          </p>
        )}
      </div>

      {result && (
        <div className="bg-green-50 p-4 rounded border border-green-200">
          <h3 className="font-bold text-green-800 mb-2">ASHRAE Standardized Output</h3>
          <pre className="text-xs overflow-x-auto text-gray-800 bg-white p-2 rounded border border-green-100">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
