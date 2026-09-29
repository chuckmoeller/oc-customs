import { memo, useState, useCallback } from 'react';
import { apiFetch } from '../services/api.js';
import ExportReadinessModal from '../components/Export/ExportReadinessModal.jsx';
import GuidedCaptureWizard from '../components/Camera/GuidedCaptureWizard.jsx';
import RoofInspectionWizard from '../components/Roof/RoofInspectionWizard.jsx';
import { useBlurDetection } from '../hooks/useBlurDetection.js';

function ScanView({
  labelClass,
  selectClass,
  inputClass,
  offlineQueueStore,
  offlineModeEnabled,
  setOfflineModeEnabled,
  jobName,
  setJobName,
  jobNumber,
  setJobNumber,
  asanaProject,
  loadedJob,
  handleLoadJob,
  loadingJob,
  showBoardPicker,
  boardMatches,
  isAsanaMode,
  asanaSections,
  category,
  setCategory,
  subcategory,
  setSubcategory,
  categoryOptions,
  subcategoryOptions,
  setSelectedCategoryItem,
  streaming,
  videoRef,
  cameraError,
  stopCamera,
  takePhoto,
  imageBase64,
  startCamera,
  fileInputRef,
  handleFileUpload,
  canvasRef,
  setView,
  equipmentNumber: _equipmentNumber,
  nameplateLabel: _nameplateLabel,
  setNameplateLabel: _setNameplateLabel,
  captureMode: parentCaptureMode,
  setCaptureMode: parentSetCaptureMode,
  onGuidedCaptureComplete,
  // Current-job export
  exportLoading,
  exportStage,
  exportError,
  exportSuccess,
  showCelebration,
  setShowCelebration,
  setExportLoading,
  setExportError,
  setExportSuccess,
  setExportStage,
  // Quick Export (search any board)
  exportJobName,
  setExportJobName,
  exportJobNumber,
  setExportJobNumber,
  handleExportSearch,
  exportBoardMatches,
  setExportBoardMatches,
  exportSelectedBoard,
  setExportSelectedBoard,
  handleExportConfirm,
  billingPullLoading,
  billingPullMessage,
  setBillingPullMessage,
  handlePullBilling,
  photoSortLoading,
  photoSortMessage,
  setPhotoSortMessage,
  handleSortPhotos,
  showReadinessModal,
  setShowReadinessModal,
  readinessData,
  readinessLoading,
  readinessError,
  activeJobTarget,
  handleOpenReadiness,
  handleSyncAsana,
  syncLoading,
  syncProgress,
  syncStatus,
  resetAll,
  resetJobContext,
}) {
  const [showGuidedWizard, setShowGuidedWizard] = useState(false);
  const [showRoofWizard, setShowRoofWizard] = useState(false);

  // Capture mode toggle: 'guided' (4-tier wizard + blur detection) vs 'quick' (single-shot nameplate)
  const [localCaptureMode, setLocalCaptureMode] = useState(() => {
    try {
      return localStorage.getItem('site_hunter_capture_mode') || 'guided';
    } catch {
      return 'guided';
    }
  });

  const captureMode = parentCaptureMode || localCaptureMode;
  const setCaptureMode = useCallback(
    (mode) => {
      if (parentSetCaptureMode) {
        parentSetCaptureMode(mode);
      } else {
        setLocalCaptureMode(mode);
        try {
          localStorage.setItem('site_hunter_capture_mode', mode);
        } catch (e) {
          console.warn('[storage] Failed to save mode:', e);
        }
      }
    },
    [parentSetCaptureMode]
  );

  // Real-time blur detection on the live single-camera viewfinder
  const blurQuality = useBlurDetection({
    videoRef,
    isStreaming: streaming,
    threshold: 110,
    intervalMs: 120,
    enabled: streaming,
  });

  const hasQueue = offlineQueueStore.queuedImages.length > 0;

  return (
    <div className="space-y-4">
      {/* ── Offline / connection strip ── */}
      <div className="bg-[#1A2332] rounded-xl shadow-sm border border-gray-700 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${offlineQueueStore.isOnline ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span className="text-xs font-semibold text-gray-300">
                {offlineQueueStore.isOnline ? '🟢 Connected' : '🔴 No Signal'}
              </span>
              {hasQueue && (
                <span className="text-xs bg-yellow-600/40 text-yellow-300 px-2 py-0.5 rounded">
                  {offlineQueueStore.queuedImages.length} queued
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              {offlineModeEnabled ? 'Mode: Save photos locally' : 'Mode: Upload immediately'}
            </p>
          </div>
          <button
            onClick={() => setOfflineModeEnabled(!offlineModeEnabled)}
            className={`px-3 py-2 rounded-lg font-medium text-xs transition-colors whitespace-nowrap ${
              offlineModeEnabled
                ? 'bg-yellow-600/40 border border-yellow-600 text-yellow-300'
                : 'bg-green-600/40 border border-green-600 text-green-300'
            }`}
          >
            {offlineModeEnabled ? 'Disable Offline' : 'Enable Offline'}
          </button>
        </div>

        {offlineModeEnabled && (
          <p className="text-xs text-yellow-400 bg-yellow-900/20 rounded-lg px-3 py-2 text-center">
            Photos saved locally. Use "Process Photos" to upload when ready.
          </p>
        )}
      </div>

      {/* ── Process queue alert ── */}
      {hasQueue && (
        <button
          onClick={() => setView('process-queue')}
          className="w-full bg-orange-600 active:bg-orange-700 text-white rounded-xl p-4 text-center transition-colors active:scale-[0.98]"
        >
          <div className="flex items-center justify-center gap-3">
            <svg
              className="w-7 h-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <div>
              <p className="text-xl font-bold">
                {offlineQueueStore.queuedImages.length}{' '}
                {offlineQueueStore.queuedImages.length === 1 ? 'Photo' : 'Photos'} to Process
              </p>
              <p className="text-xs text-orange-200">Tap to review and classify with AI</p>
            </div>
          </div>
        </button>
      )}

      {/* ── Job setup ── */}
      <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className={`${labelClass} whitespace-nowrap`}>Board Name</label>
            <input
              type="text"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && jobName.trim() && !asanaProject)
                  handleLoadJob(jobName.trim());
              }}
              placeholder={asanaProject ? '' : 'Search...'}
              className={`${inputClass} ${asanaProject ? 'bg-[#1a2a1a] border-[#3a5a3a] text-gray-300' : ''}`}
              readOnly={!!asanaProject}
            />
          </div>
          <div className="w-28">
            <label className={`${labelClass} whitespace-nowrap`}>Job #</label>
            <input
              type="text"
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLoadJob()}
              placeholder="Board ID"
              className={inputClass}
            />
          </div>
          <button
            onClick={() => handleLoadJob(jobNumber.trim() || jobName.trim())}
            disabled={loadingJob || (!jobNumber.trim() && !jobName.trim())}
            className="bg-[#67986A] hover:bg-[#5a8a5d] text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {loadingJob ? '...' : 'Load'}
          </button>
        </div>

        {asanaProject && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#67986A] flex items-center gap-1">
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Asana project loaded — {asanaSections.length || 0} section
              {asanaSections.length !== 1 ? 's' : ''}
            </p>
            <button onClick={resetJobContext} className="text-xs text-gray-400 hover:text-red-500">
              Clear
            </button>
          </div>
        )}

        {showBoardPicker && boardMatches.length > 1 && (
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3 space-y-2">
            <p className="text-sm font-medium text-yellow-300">
              Multiple projects found — pick one:
            </p>
            {boardMatches.map((b) => (
              <button
                key={b.gid}
                onClick={() => handleLoadJob(b.gid)}
                className="w-full text-left bg-[#1A2332] border border-gray-600 rounded-lg px-3 py-2 hover:bg-green-900/20 hover:border-green-500 transition-colors"
              >
                <span className="font-medium text-gray-100">{b.name}</span>
                <span className="ml-2 text-xs text-gray-400">ID: {b.gid}</span>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>
              Category {isAsanaMode && <span className="text-[#67986A] text-xs">(from Asana)</span>}
            </label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSubcategory('');
                if (isAsanaMode) {
                  const item = asanaSections.find((c) => c.name === e.target.value);
                  setSelectedCategoryItem(item || null);
                }
              }}
              className={selectClass}
            >
              <option value="">Select category...</option>
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
              {subcategoryOptions.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Workflow Mode Toggle: Guided HVAC vs Roof Inspection vs Quick Scan ── */}
      <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-gray-300 whitespace-nowrap">
              Workflow Mode:
            </span>
            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border whitespace-nowrap ${
                captureMode === 'roof'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                  : captureMode === 'guided'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                    : 'bg-blue-950/80 text-blue-300 border-blue-500/40'
              }`}
            >
              {captureMode === 'roof'
                ? '🏠 Roof (9-Tier)'
                : captureMode === 'guided'
                  ? '⚡ Guided HVAC'
                  : '🚀 Quick Scan'}
            </span>
          </div>
          <div className="inline-flex rounded-lg bg-[#0D1520] p-1 border border-gray-700 flex-shrink-0">
            <button
              type="button"
              onClick={() => setCaptureMode('guided')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                captureMode === 'guided'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              ⚡ Guided
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode('roof')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                captureMode === 'roof'
                  ? 'bg-amber-600 text-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              🏠 Roof (9-Tier)
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode('quick')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                captureMode === 'quick'
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              🚀 Quick
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400">
          {captureMode === 'roof'
            ? 'Commercial 9-tier roof inspection: context, overview, membrane, defects, penetrations, RTUs, coping, drains, access & automatic executive report dispatch.'
            : captureMode === 'guided'
              ? 'Guided workflow: Nameplate scan with blur detection HUD, followed by optional supporting photos.'
              : 'Streamlined single-shot nameplate scanner for fast, unguided captures directly to AI spec extraction.'}
        </p>
      </div>

      {/* ── Mode-Specific Active Banner / Hero ── */}
      {captureMode === 'roof' ? (
        <button
          type="button"
          onClick={() => setShowRoofWizard(true)}
          className="w-full flex items-center justify-between bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-600 text-white rounded-xl p-3.5 shadow-lg shadow-orange-950/40 border border-amber-400/30 transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-black/30 border border-white/20 flex items-center justify-center text-xl flex-shrink-0">
              🏠
            </div>
            <div className="text-left">
              <div className="font-bold text-sm tracking-wide flex items-center gap-2">
                Start Commercial Roof Inspection
                <span className="text-[10px] uppercase font-bold tracking-wider bg-black/40 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/30">
                  9-Tier Audit
                </span>
              </div>
              <p className="text-xs text-amber-100/90 mt-0.5 font-medium">
                Context → Overview → Membrane → Conditions → Penetrations → RTUs → Drainage
              </p>
            </div>
          </div>
          <svg
            className="w-5 h-5 text-amber-200 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : captureMode === 'guided' ? (
        <button
          type="button"
          onClick={() => setShowGuidedWizard(true)}
          className="w-full flex items-center justify-between bg-gradient-to-r from-emerald-600 via-teal-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white rounded-xl p-3.5 shadow-lg shadow-green-950/40 border border-emerald-400/30 transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-black/30 border border-white/20 flex items-center justify-center text-xl flex-shrink-0">
              ⚡
            </div>
            <div className="text-left">
              <div className="font-bold text-sm tracking-wide flex items-center gap-2">
                Start Guided Capture Wizard
                <span className="text-[10px] uppercase font-bold tracking-wider bg-black/40 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30">
                  Edge Agent
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 mt-0.5 font-medium">
                Nameplate (1) → Optional Supporting: Overview (1a), Disconnect / Panel (1b)
              </p>
            </div>
          </div>
          <svg
            className="w-5 h-5 text-emerald-200 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : (
        <div className="bg-gradient-to-r from-blue-950/50 via-[#1A2332] to-blue-950/50 rounded-xl border border-blue-500/30 p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-xl text-blue-400 flex-shrink-0">
              🚀
            </div>
            <div className="text-left">
              <div className="font-bold text-sm tracking-wide text-blue-200">
                Quick Scan Mode Active
              </div>
              <p className="text-xs text-gray-300 mt-0.5">
                Single-shot nameplate capture for instant VLM spec extraction
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startCamera}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3.5 py-2 text-xs font-semibold shadow-md transition-all active:scale-95 whitespace-nowrap"
          >
            Open Camera
          </button>
        </div>
      )}

      {/* ── Camera ── */}
      {streaming ? (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <video ref={videoRef} autoPlay playsInline muted className="flex-1 w-full object-cover" />
          {cameraError && (
            <div className="absolute top-0 left-0 right-0 bg-red-600/90 text-white p-3 text-sm text-center">
              {cameraError}
            </div>
          )}

          {/* Quick Scan Viewfinder Header Badge with Non-Blocking Focus Dot */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/75 backdrop-blur border border-blue-400/30 text-xs font-semibold shadow-lg">
            <span
              className="w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ backgroundColor: blurQuality.isSharp ? '#22C55E' : '#3B82F6' }}
            />
            <span className="text-blue-300">Quick Scan • Align Nameplate</span>
          </div>

          {/* Minimal Nameplate Framing Reticle */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
            <div className="w-full max-w-sm aspect-[4/3] border-2 border-blue-400/60 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
              <div className="absolute -top-3 left-4 bg-black/80 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider text-blue-300 border border-blue-400/40">
                Nameplate Frame
              </div>
              <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-blue-400" />
              <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-blue-400" />
              <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-blue-400" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-blue-400" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent">
            <button
              onClick={stopCamera}
              className="w-14 h-14 rounded-full bg-gray-700/80 border-2 border-white/30 flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <button
              onClick={takePhoto}
              className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 flex items-center justify-center active:scale-90 transition-transform"
            >
              <div className="w-16 h-16 rounded-full bg-white border-2 border-gray-400" />
            </button>
            <div className="w-14 h-14" />
          </div>
        </div>
      ) : (
        <div className="bg-[#1A2332] rounded-xl border border-gray-700 overflow-hidden">
          {cameraError && (
            <div className="bg-red-50 border-b border-red-200 text-red-700 p-3 text-sm">
              {cameraError}
            </div>
          )}
          {imageBase64 ? (
            <div className="bg-black">
              <img
                src={imageBase64}
                alt="Captured"
                className="w-full max-h-[50vh] object-contain"
              />
            </div>
          ) : (
            <div className="bg-gray-800 flex items-center justify-center h-[30vh]">
              <div className="text-center text-gray-400">
                <svg
                  className="w-16 h-16 mx-auto mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <p className="text-sm">Take a photo or load one</p>
              </div>
            </div>
          )}
          <div className="p-4 flex gap-3">
            {captureMode === 'guided' ? (
              <button
                onClick={() => setShowGuidedWizard(true)}
                className="flex-1 flex items-center justify-center gap-2 bg-[#67986A] text-white rounded-lg px-4 py-3 font-medium hover:bg-[#5a8a5d] transition-colors"
              >
                <span>⚡</span>
                Start Guided Survey
              </button>
            ) : (
              <button
                onClick={startCamera}
                className="flex-1 flex items-center justify-center gap-2 bg-[#67986A] text-white rounded-lg px-4 py-3 font-medium hover:bg-[#5a8a5d] transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Take Photo
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg px-4 py-3 font-medium hover:bg-gray-600 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Load Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif,.HEIC,.HEIF"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* ── Job actions (when board loaded) ── */}
      {asanaProject && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setView('job-photos')}
            className="flex items-center justify-center gap-2 bg-[#1A2332] border border-gray-600 text-gray-300 rounded-xl px-4 py-3 font-medium hover:bg-gray-700 hover:border-[#67986A] transition-colors"
          >
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
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Job Photos
          </button>

          {loadedJob?.id && (
            <>
              <button
                onClick={() => handleOpenReadiness(loadedJob)}
                disabled={exportLoading}
                className="flex items-center justify-center gap-2 bg-[#1A2332] border border-gray-600 text-gray-300 rounded-xl px-4 py-3 font-medium hover:bg-gray-700 hover:border-[#67986A] transition-colors disabled:opacity-50"
              >
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
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                {exportLoading ? 'Exporting...' : 'Export Excel'}
              </button>
              <button
                onClick={async () => {
                  setExportLoading(true);
                  setExportError(null);
                  setExportSuccess(null);
                  setShowCelebration(false);
                  setExportStage('downloading');
                  try {
                    const response = await apiFetch(`/api/export/equipment/${loadedJob.id}`, {
                      method: 'GET',
                    });
                    if (!response.ok) throw new Error("Export failed");

                    // 1. Convert the binary response to a Blob
                    const blob = await response.blob();

                    // 2. Create a temporary URL for the Blob
                    const downloadUrl = window.URL.createObjectURL(blob);

                    // 3. Create a hidden <a> tag and click it to trigger the download
                    const disposition = response.headers.get('content-disposition');
                    const filename =
                      disposition?.match(/filename="?([^"]+)"?/)?.[1] ||
                      `${jobName || 'Equipment'}_Inventory.csv`;

                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.setAttribute('download', filename);
                    document.body.appendChild(link);
                    link.click();

                    // 4. Cleanup
                    link.parentNode.removeChild(link);
                    window.URL.revokeObjectURL(downloadUrl);
                    setExportSuccess(`${jobName || 'Equipment'} CSV exported!`);
                    setShowCelebration(true);
                    setTimeout(() => setShowCelebration(false), 5000);
                  } catch (err) {
                    setExportError(err.message || 'Export failed');
                  } finally {
                    setExportLoading(false);
                    setExportStage('');
                  }
                }}
                disabled={exportLoading}
                title="Equipment inventory CSV — every device, every field"
                className="flex items-center justify-center gap-2 bg-[#1A2332] border border-gray-600 text-gray-300 rounded-xl px-4 py-3 font-medium hover:bg-gray-700 hover:border-[#67986A] transition-colors disabled:opacity-50"
              >
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
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                {exportLoading ? 'Exporting…' : 'Equipment CSV'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Export progress / error */}
      {exportLoading && exportStage === 'downloading' && (
        <div className="bg-[#0D1520] rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-[#67986A] border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span className="text-sm text-gray-300">Generating file...</span>
        </div>
      )}
      {exportError && <p className="text-xs text-red-400 px-1">{exportError}</p>}

      {/* ── Quick Export (search any board) ── */}
      <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <svg
            className="w-4 h-4 text-[#67986A]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Export Any Job
        </h3>
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Board Name</label>
            <input
              type="text"
              value={exportJobName}
              onChange={(e) => {
                setExportJobName(e.target.value);
                setExportSelectedBoard(null);
                setExportBoardMatches([]);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleExportSearch()}
              placeholder="Search..."
              className="w-full bg-[#0D1520] border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#67986A]"
            />
          </div>
          <div className="w-28">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Job #</label>
            <input
              type="text"
              value={exportJobNumber}
              onChange={(e) => {
                setExportJobNumber(e.target.value);
                setExportSelectedBoard(null);
                setExportBoardMatches([]);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleExportSearch()}
              placeholder="Board ID"
              className="w-full bg-[#0D1520] border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#67986A]"
            />
          </div>
          <button
            onClick={handleExportSearch}
            disabled={exportLoading || (!exportJobName.trim() && !exportJobNumber.trim())}
            className="bg-gray-600 hover:bg-gray-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {exportLoading && !exportStage ? '...' : 'Search'}
          </button>
        </div>

        {exportBoardMatches.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400">Select a project:</p>
            {exportBoardMatches.map((b) => (
              <button
                key={b.gid}
                onClick={() => {
                  setExportSelectedBoard(b);
                  setExportBoardMatches([]);
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm bg-[#0D1520] border border-gray-600 text-gray-300 hover:border-[#67986A]/50 transition-colors"
              >
                <span className="font-medium">{b.name}</span>
                <span className="text-gray-500 text-xs ml-2">#{b.gid}</span>
              </button>
            ))}
          </div>
        )}

        {exportSelectedBoard && !exportLoading && (
          <div className="bg-[#0D1520] rounded-lg px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <svg
                  className="w-4 h-4 text-[#67986A] flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-gray-200 truncate">{exportSelectedBoard.name}</span>
              </div>
              <div className="flex gap-2 ml-3">
                <button
                  onClick={() => handleOpenReadiness(exportSelectedBoard)}
                  disabled={exportLoading}
                  className="bg-[#67986A] hover:bg-[#5a8a5d] disabled:opacity-50 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
                >
                  Preview & Export
                </button>
                <button
                  onClick={() => handleExportConfirm(exportSelectedBoard, 'csv')}
                  disabled={exportLoading}
                  title="Equipment inventory CSV — every device, every field"
                  className="border border-[#67986A] text-[#67986A] hover:bg-[#67986A]/10 disabled:opacity-50 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
                >
                  Equipment CSV
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-gray-700/60">
              <span className="text-xs text-gray-400 truncate">
                {billingPullMessage ?? 'Bills uploaded to Asana? Pull them in before exporting.'}
              </span>
              <button
                onClick={() => {
                  setBillingPullMessage(null);
                  handlePullBilling(exportSelectedBoard);
                }}
                disabled={billingPullLoading}
                className="flex-shrink-0 flex items-center gap-1.5 border border-gray-600 text-gray-300 hover:border-[#67986A]/50 disabled:opacity-50 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap"
              >
                {billingPullLoading && (
                  <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                )}
                {billingPullLoading ? 'Pulling…' : 'Pull Bills'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-gray-700/60">
              <span className="text-xs text-gray-400 truncate">
                {photoSortMessage ??
                  'Nameplate photos dumped in one Asana task? Sort them into devices.'}
              </span>
              <button
                onClick={() => {
                  setPhotoSortMessage(null);
                  handleSortPhotos(exportSelectedBoard);
                }}
                disabled={photoSortLoading}
                className="flex-shrink-0 flex items-center gap-1.5 border border-gray-600 text-gray-300 hover:border-[#67986A]/50 disabled:opacity-50 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap"
              >
                {photoSortLoading && (
                  <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                )}
                {photoSortLoading ? 'Sorting…' : 'Sort & Classify Photos'}
              </button>
            </div>
          </div>
        )}

        {exportLoading && exportStage && exportStage !== 'looking-up' && (
          <div className="bg-[#0D1520] rounded-lg px-4 py-3 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-[#67986A] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-300">
                {exportStage === 'building' && 'Preparing export…'}
                {exportStage === 'downloading' && 'Generating file…'}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-[#67986A] rounded-full transition-all duration-1000 ease-out"
                style={{ width: exportStage === 'building' ? '50%' : '85%' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Celebration banner ── */}
      {showCelebration && (
        <div className="relative overflow-hidden bg-gradient-to-r from-[#1a2a1a] via-[#2a3a2a] to-[#1a2a1a] border border-[#67986A]/50 rounded-xl px-4 py-4">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-[confetti_2s_ease-out_forwards]"
                style={{
                  left: `${5 + Math.random() * 90}%`,
                  top: '-8px',
                  backgroundColor: [
                    '#FFD700',
                    '#67986A',
                    '#FF6B6B',
                    '#4ECDC4',
                    '#FFA07A',
                    '#87CEEB',
                  ][i % 6],
                  animationDelay: `${Math.random() * 0.8}s`,
                  animationDuration: `${1.5 + Math.random() * 1.5}s`,
                }}
              />
            ))}
          </div>
          <div className="relative flex items-center gap-3">
            <span className="text-3xl">🍾</span>
            <div>
              <p className="text-[#67986A] font-bold text-sm">Export Complete!</p>
              <p className="text-gray-400 text-xs">{exportSuccess}</p>
            </div>
            <button
              onClick={() => setShowCelebration(false)}
              className="ml-auto text-gray-500 hover:text-gray-300 text-lg"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setView('job-photos')}
          className="flex items-center justify-center gap-2 bg-[#1A2332] border border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-300 active:bg-white/5 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          Quick Photo
        </button>
        <button
          onClick={() => setView('jobs')}
          className="flex items-center justify-center gap-2 bg-[#1A2332] border border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-300 active:bg-white/5 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-purple-600/20 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-purple-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          Jobs
        </button>
        <button
          onClick={() => setView('history')}
          className="flex items-center justify-center gap-2 bg-[#1A2332] border border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-300 active:bg-white/5 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-amber-600/20 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-amber-400"
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
          </div>
          Scan History
        </button>
        <button
          onClick={resetAll}
          className="flex items-center justify-center gap-2 bg-[#1A2332] border border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-400 active:bg-white/5 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-gray-600/20 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          New Job
        </button>
        <button
          onClick={() => setView('analytics')}
          className="col-span-2 flex items-center justify-center gap-2 bg-[#1A2332] border border-gray-700 rounded-xl px-4 py-3 text-sm font-medium text-gray-300 active:bg-white/5 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          Analytics
        </button>
      </div>

      <ExportReadinessModal
        isOpen={showReadinessModal}
        onClose={() => setShowReadinessModal(false)}
        readinessData={readinessData}
        loading={readinessLoading}
        error={readinessError}
        onDownloadExcel={() => {
          handleExportConfirm(activeJobTarget || loadedJob || exportSelectedBoard, 'excel');
        }}
        onDownloadCsv={() => {
          handleExportConfirm(activeJobTarget || loadedJob || exportSelectedBoard, 'csv');
        }}
        onStartSync={() => handleSyncAsana(activeJobTarget || loadedJob || exportSelectedBoard)}
        syncLoading={syncLoading}
        syncProgress={syncProgress}
        syncStatus={syncStatus}
        onSortPhotos={() => handleSortPhotos(activeJobTarget || loadedJob || exportSelectedBoard)}
        photoSortLoading={photoSortLoading}
        onPullBills={() => handlePullBilling(activeJobTarget || loadedJob || exportSelectedBoard)}
        billingPullLoading={billingPullLoading}
      />

      <GuidedCaptureWizard
        isOpen={showGuidedWizard}
        onClose={() => setShowGuidedWizard(false)}
        onComplete={(result) => {
          setShowGuidedWizard(false);
          onGuidedCaptureComplete?.(result);
        }}
        equipmentNumber={_equipmentNumber || '1'}
        jobContext={{
          jobName,
          jobNumber,
          asanaProjectGid: asanaProject?.gid || null,
          category,
          subcategory,
        }}
      />

      <RoofInspectionWizard
        isOpen={showRoofWizard}
        onClose={() => setShowRoofWizard(false)}
        onComplete={(_result) => {
          setShowRoofWizard(false);
        }}
        jobContext={{
          jobName,
          jobNumber,
          asanaProjectGid: asanaProject?.gid || null,
          category,
          subcategory,
        }}
      />

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default memo(ScanView);
