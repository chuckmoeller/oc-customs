import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ROOF_INSPECTION_TIERS,
  ROOF_MEMBRANE_OPTIONS,
  WARRANTY_STATUS_OPTIONS,
  ROOF_CONDITION_OPTIONS,
} from '../../constants/roofTaxonomy.js';
import { useBlurDetection } from '../../hooks/useBlurDetection.js';
import {
  stageRoofInspectionPhoto,
  submitRoofInspectionSurvey,
} from '../../services/roofInspectionService.js';
import { formatSha256 } from '../../utils/cryptoUtils.js';

/**
 * Commercial Roof Inspection Wizard
 *
 * Implements:
 * 1. 9-tier capture taxonomy with framing overlays and tips.
 * 2. Multi-photo capture per tier with real-time thumbnail carousel and deletion.
 * 3. Laplacian variance edge sharpness evaluator and blur bypass lock.
 * 4. Field notes checklist (building sq ft, roof sq ft, age, warranty, membrane, condition).
 * 5. Review & Submit drawer with direct dispatch to GCP Pub/Sub `spec-hunter-events`.
 */
export default function RoofInspectionWizard({ isOpen, onClose, onComplete, jobContext = {} }) {
  const [activeTierIndex, setActiveTierIndex] = useState(0);
  const [capturedAssets, setCapturedAssets] = useState({
    'site-context': [],
    'roof-overview': [],
    membrane: [],
    'surface-condition': [],
    penetrations: [],
    'rooftop-equipment': [],
    'edge-perimeter': [],
    'drainage-slope': [],
    'safety-access': [],
  });

  // Checklist state
  const [checklist, setChecklist] = useState({
    buildingSqFt: '',
    roofSqFt: '',
    estimatedAge: '',
    warrantyStatus: WARRANTY_STATUS_OPTIONS[0],
    membraneType: ROOF_MEMBRANE_OPTIONS[0],
    conditionRating: ROOF_CONDITION_OPTIONS[0],
    notes: '',
  });

  const [recipientEmail, setRecipientEmail] = useState('chuck@madisonenergygroup.com');
  const [activeTab, setActiveTab] = useState('camera'); // 'camera' | 'checklist' | 'review'
  const [streaming, setStreaming] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isStaging, setIsStaging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [bypassBlur, setBypassBlur] = useState(false);
  const [flashFeedback, setFlashFeedback] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const tierScrollRef = useRef(null);

  const activeTier = ROOF_INSPECTION_TIERS[activeTierIndex] || ROOF_INSPECTION_TIERS[0];
  const currentTierPhotos = capturedAssets[activeTier.id] || [];

  const totalPhotosCount = Object.values(capturedAssets).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0
  );

  // Flatten all staged assets for submission
  const allStagedAssets = Object.entries(capturedAssets).flatMap(([tierId, list]) =>
    (list || []).map((asset, idx) => ({
      ...asset,
      taxonomy: tierId,
      photo_index: idx,
    }))
  );

  // Real-time blur detection hook
  const blurQuality = useBlurDetection({
    videoRef,
    isStreaming: streaming && isOpen && activeTab === 'camera',
    threshold: 105,
    intervalMs: 120,
    enabled: streaming && isOpen && activeTab === 'camera',
  });

  // Start camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      }
    } catch (err) {
      console.error('[roof-wizard:camera] Camera access error:', err);
      setCameraError('Camera access unavailable. Please grant camera permissions.');
    }
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

  // Manage camera on open / tab change
  useEffect(() => {
    if (isOpen && activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, activeTab, startCamera, stopCamera]);

  // Keep active step pill in view
  useEffect(() => {
    if (tierScrollRef.current) {
      const activeEl = tierScrollRef.current.children[activeTierIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTierIndex]);

  // Handle photo deletion
  const handleDeletePhoto = useCallback((tierId, idx) => {
    setCapturedAssets((prev) => {
      const list = prev[tierId] || [];
      return {
        ...prev,
        [tierId]: list.filter((_, i) => i !== idx),
      };
    });
  }, []);

  // Take snapshot
  const handleTakeSnapshot = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const frameQuality = blurQuality.checkCurrentFrame() || blurQuality;

    if (!bypassBlur && frameQuality.isBlurry) {
      return;
    }

    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL('image/jpeg', 0.88);

    // Visual shutter flash effect
    setFlashFeedback(true);
    setTimeout(() => setFlashFeedback(false), 180);

    setIsStaging(true);

    try {
      const existingList = capturedAssets[activeTier.id] || [];
      const photoIndex = existingList.length;

      // Stage photo: hash SHA-256, label stamp, and Firebase upload
      const staged = await stageRoofInspectionPhoto({
        imageBase64: base64,
        tierId: activeTier.id,
        photoIndex,
        label: `${activeTier.badge}. ${activeTier.label}`,
        sharpnessScore: frameQuality.sharpnessScore || 0,
        jobContext,
      });

      const newAsset = {
        ...staged,
        rawBase64: base64,
      };

      setCapturedAssets((prev) => ({
        ...prev,
        [activeTier.id]: [...(prev[activeTier.id] || []), newAsset],
      }));
    } catch (err) {
      console.error('[roof-wizard:snapshot] Staging error:', err);
    } finally {
      setIsStaging(false);
    }
  }, [activeTier, blurQuality, bypassBlur, capturedAssets, jobContext]);

  // Submit full survey to Pub/Sub
  const handleSubmitSurvey = async () => {
    if (allStagedAssets.length === 0) {
      setSubmitError('Please capture at least one roof photo before submitting.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await submitRoofInspectionSurvey({
        jobContext,
        checklist,
        assets: allStagedAssets,
        recipient: recipientEmail.trim() || 'chuck@madisonenergygroup.com',
        intentConfirmation: 'ok, send it',
        guardrail: 'ok, send it',
      });

      setSubmitSuccess({
        eventId: response.event_id || response.payload?.event_id,
        messageId: response.messageId || 'pubsub-acknowledged',
        totalPhotos: allStagedAssets.length,
        recipient: recipientEmail,
      });

      onComplete?.(response);
    } catch (err) {
      console.error('[roof-wizard:submit] Submission error:', err);
      setSubmitError(`Failed to submit inspection survey: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#0B1118] text-white flex flex-col select-none overflow-hidden font-sans">
      {/* ── Top Header Strip ── */}
      <div className="flex-none bg-[#101923]/95 backdrop-blur border-b border-gray-800 px-4 pt-3 pb-2 z-30">
        <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-white text-sm font-bold tracking-wide uppercase truncate flex items-center gap-2">
                <span>Roof Inspection</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-600/40 px-2 py-0.5 rounded-full font-semibold">
                  9-Tier
                </span>
              </h2>
              <p className="text-[11px] text-gray-400 truncate">
                {jobContext.jobName || 'Commercial Facility'}{' '}
                {jobContext.jobNumber ? `• Job #${jobContext.jobNumber}` : ''}
              </p>
            </div>
          </div>

          {/* Tab Navigation Controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="inline-flex rounded-lg bg-gray-900/90 p-0.5 border border-gray-700">
              <button
                type="button"
                onClick={() => setActiveTab('camera')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'camera'
                    ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                📸 Camera
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('checklist')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'checklist'
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                📋 Notes
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('review')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                  activeTab === 'review'
                    ? 'bg-purple-600 text-white shadow-sm font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>Audit</span>
                <span className="bg-emerald-500 text-black rounded-full min-w-4 h-4 px-1 inline-flex items-center justify-center text-[10px] font-bold">
                  {totalPhotosCount}
                </span>
              </button>
            </div>

            <button
              onClick={() => {
                stopCamera();
                onClose?.();
              }}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
              aria-label="Close inspection wizard"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* ── 9-Tier Step Scrollable Navigator (Visible in Camera Mode) ── */}
        {activeTab === 'camera' && (
          <div
            ref={tierScrollRef}
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 max-w-3xl mx-auto scroll-smooth"
          >
            {ROOF_INSPECTION_TIERS.map((tier, idx) => {
              const photos = capturedAssets[tier.id] || [];
              const count = photos.length;
              const isActive = idx === activeTierIndex;
              const hasPhotos = count > 0;

              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setActiveTierIndex(idx)}
                  className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-emerald-600 text-white ring-1 ring-emerald-400 font-semibold shadow-md'
                      : hasPhotos
                        ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/60'
                        : 'bg-gray-900/80 text-gray-400 border border-gray-800 hover:text-gray-200'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${
                      isActive
                        ? 'bg-white text-emerald-800'
                        : hasPhotos
                          ? 'bg-emerald-500 text-black'
                          : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    {hasPhotos ? count : tier.badge}
                  </span>
                  <span className="whitespace-nowrap">{tier.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Main Tab Contents ── */}
      <div className="relative flex-1 bg-black overflow-hidden flex flex-col">
        {/* ── TAB 1: Camera Viewfinder ── */}
        {activeTab === 'camera' && (
          <>
            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-150 ${
                  flashFeedback ? 'opacity-20' : 'opacity-100'
                }`}
              />

              {cameraError && (
                <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center z-30">
                  <p className="text-red-400 font-medium mb-4">{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-semibold"
                  >
                    Retry Camera
                  </button>
                </div>
              )}

              {/* Dynamic Target Framing Overlay */}
              {streaming && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                  <div
                    className="relative border-2 transition-all duration-300 flex items-center justify-center rounded-2xl"
                    style={{
                      width: `${activeTier.framingBox.widthPercent}%`,
                      height: `${activeTier.framingBox.heightPercent}%`,
                      borderColor: blurQuality.isSharp
                        ? activeTier.framingBox.strokeColor
                        : '#EF4444',
                      boxShadow: `0 0 24px ${
                        blurQuality.isSharp
                          ? activeTier.framingBox.glowColor
                          : 'rgba(239, 68, 68, 0.35)'
                      }`,
                    }}
                  >
                    {/* Corner Laser Brackets */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-white" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-white" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-white" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-white" />

                    {/* Reticle */}
                    {activeTier.framingBox.reticle && (
                      <div className="w-8 h-8 pointer-events-none opacity-60">
                        <div className="w-full h-0.5 bg-white/70 absolute top-1/2 -translate-y-1/2" />
                        <div className="h-full w-0.5 bg-white/70 absolute left-1/2 -translate-x-1/2" />
                      </div>
                    )}

                    {/* Framing Label Tag */}
                    <div className="absolute bottom-2 bg-black/75 backdrop-blur text-white text-[11px] font-medium px-3 py-1 rounded-full border border-white/20">
                      {activeTier.framingBox.overlayLabel}
                    </div>
                  </div>
                </div>
              )}

              {/* Live Blur Sharpness HUD Badge */}
              {streaming && (
                <div className="absolute top-3 left-4 right-4 flex items-center justify-between gap-2 z-20 pointer-events-none">
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg text-xs font-semibold text-white backdrop-blur border"
                    style={{
                      backgroundColor: 'rgba(17, 24, 39, 0.85)',
                      borderColor: blurQuality.color,
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: blurQuality.color }}
                    />
                    <span>{blurQuality.feedbackMessage}</span>
                  </div>

                  <div className="bg-black/80 backdrop-blur px-3 py-1 rounded-full border border-gray-700 flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 font-mono">FOCUS</span>
                    <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-150"
                        style={{
                          width: `${blurQuality.sharpnessScore}%`,
                          backgroundColor: blurQuality.color,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-gray-200">
                      {blurQuality.sharpnessScore}%
                    </span>
                  </div>
                </div>
              )}

              {/* Multi-Photo Carousel for the active tier */}
              {streaming && currentTierPhotos.length > 0 && (
                <div className="absolute top-14 left-4 right-4 z-20 flex items-center gap-2 overflow-x-auto py-1 px-2.5 bg-black/80 backdrop-blur rounded-xl border border-white/15 shadow-lg">
                  <span className="text-[11px] font-semibold text-emerald-400 flex-shrink-0">
                    {currentTierPhotos.length} photo{currentTierPhotos.length !== 1 ? 's' : ''}:
                  </span>
                  {currentTierPhotos.map((photo, pIdx) => (
                    <div
                      key={photo.image_hash || photo.id || pIdx}
                      className="relative flex-shrink-0 w-11 h-11 rounded-lg border border-white/40 overflow-hidden bg-black shadow"
                    >
                      <img
                        src={photo.base64 || photo.storage_url}
                        alt={photo.label}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePhoto(activeTier.id, pIdx);
                        }}
                        className="absolute top-0 right-0 bg-red-600 hover:bg-red-500 text-white rounded-bl p-0.5"
                        title="Remove photo"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                      <span className="absolute bottom-0 inset-x-0 bg-black/85 text-[8px] text-center text-white font-mono">
                        #{pIdx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tier Instructions & Field Guidance Overlay */}
              <div className="absolute bottom-3 left-4 right-4 z-10 pointer-events-none flex justify-center">
                <div className="bg-black/80 backdrop-blur border border-gray-700/80 text-gray-200 text-xs px-4 py-2 rounded-xl text-center max-w-lg shadow-md">
                  <p className="font-semibold text-emerald-400 mb-0.5">
                    Step {activeTier.badge}: {activeTier.title}
                  </p>
                  <p className="text-[11px] text-gray-300">{activeTier.instruction}</p>
                </div>
              </div>
            </div>

            {/* Camera Bottom Shutter Bar */}
            <div className="flex-none bg-[#101923]/95 backdrop-blur border-t border-gray-800 pt-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] z-20">
              <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
                {/* Previous Step */}
                <button
                  type="button"
                  onClick={() => setActiveTierIndex((prev) => Math.max(0, prev - 1))}
                  disabled={activeTierIndex === 0}
                  className="w-12 h-12 rounded-full bg-gray-800 disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center active:scale-95 transition-transform"
                  aria-label="Previous tier"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>

                {/* Shutter Button */}
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={handleTakeSnapshot}
                    disabled={isStaging || (!bypassBlur && blurQuality.isBlurry)}
                    className={`w-20 h-20 rounded-full border-4 flex items-center justify-center shadow-2xl transition-all duration-200 active:scale-90 ${
                      isStaging
                        ? 'border-gray-500 bg-gray-700 animate-pulse'
                        : blurQuality.isSharp || bypassBlur
                          ? 'border-emerald-400 bg-white ring-4 ring-emerald-500/30'
                          : 'border-red-500 bg-gray-300 opacity-60'
                    }`}
                    aria-label="Take inspection photo"
                  >
                    <div
                      className={`w-16 h-16 rounded-full border-2 transition-colors ${
                        blurQuality.isSharp || bypassBlur
                          ? 'bg-white border-gray-400'
                          : 'bg-red-200 border-red-400'
                      }`}
                    />
                  </button>
                  <span className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-semibold">
                    {isStaging
                      ? 'Staging...'
                      : blurQuality.isSharp || bypassBlur
                        ? currentTierPhotos.length > 0
                          ? `+ Add Photo (${currentTierPhotos.length})`
                          : 'Snap Photo'
                        : 'Hold Steady'}
                  </span>
                </div>

                {/* Next Step / Complete */}
                {activeTierIndex < ROOF_INSPECTION_TIERS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTierIndex((prev) =>
                        Math.min(ROOF_INSPECTION_TIERS.length - 1, prev + 1)
                      )
                    }
                    className="w-12 h-12 rounded-full bg-gray-800 text-white flex items-center justify-center active:scale-95 transition-transform"
                    aria-label="Next tier"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTab('review')}
                    className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
                    aria-label="Review and submit"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {/* Sub-bar: Blur Override & Direct Jump to Checklist */}
              <div className="max-w-xl mx-auto flex items-center justify-between mt-2 pt-2 border-t border-gray-800 text-xs">
                <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bypassBlur}
                    onChange={(e) => setBypassBlur(e.target.checked)}
                    className="rounded bg-gray-800 border-gray-700 text-emerald-500 focus:ring-0"
                  />
                  <span className="text-[11px]">Bypass blur lock</span>
                </label>

                <button
                  type="button"
                  onClick={() => setActiveTab('checklist')}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                >
                  <span>Edit Field Notes</span>
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── TAB 2: Checklist & Field Notes ── */}
        {activeTab === 'checklist' && (
          <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full space-y-4">
            <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-4">
              <div className="border-b border-gray-700 pb-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>📋 Commercial Roof Field Checklist</span>
                  <span className="text-xs text-gray-400 font-normal">Metadata Specs</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Record physical building dimensions, membrane classification, and warranty info.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Building Square Footage (sq ft)
                  </label>
                  <input
                    type="number"
                    value={checklist.buildingSqFt}
                    onChange={(e) =>
                      setChecklist((prev) => ({ ...prev, buildingSqFt: e.target.value }))
                    }
                    placeholder="e.g. 120000"
                    className="w-full bg-[#0D1520] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Roof Area Square Footage (sq ft)
                  </label>
                  <input
                    type="number"
                    value={checklist.roofSqFt}
                    onChange={(e) =>
                      setChecklist((prev) => ({ ...prev, roofSqFt: e.target.value }))
                    }
                    placeholder="e.g. 95000"
                    className="w-full bg-[#0D1520] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Estimated Roof Age (years)
                  </label>
                  <input
                    type="number"
                    value={checklist.estimatedAge}
                    onChange={(e) =>
                      setChecklist((prev) => ({ ...prev, estimatedAge: e.target.value }))
                    }
                    placeholder="e.g. 8"
                    className="w-full bg-[#0D1520] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Warranty Status
                  </label>
                  <select
                    value={checklist.warrantyStatus}
                    onChange={(e) =>
                      setChecklist((prev) => ({ ...prev, warrantyStatus: e.target.value }))
                    }
                    className="w-full bg-[#0D1520] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    {WARRANTY_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Roof Membrane Type
                  </label>
                  <select
                    value={checklist.membraneType}
                    onChange={(e) =>
                      setChecklist((prev) => ({ ...prev, membraneType: e.target.value }))
                    }
                    className="w-full bg-[#0D1520] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    {ROOF_MEMBRANE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Overall Condition Rating
                  </label>
                  <select
                    value={checklist.conditionRating}
                    onChange={(e) =>
                      setChecklist((prev) => ({ ...prev, conditionRating: e.target.value }))
                    }
                    className="w-full bg-[#0D1520] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    {ROOF_CONDITION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Field Notes & Observations
                </label>
                <textarea
                  rows={4}
                  value={checklist.notes}
                  onChange={(e) => setChecklist((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Detail ponding locations, parapet integrity, puncture areas, drainage blockages, or mechanical vibration pads..."
                  className="w-full bg-[#0D1520] border border-gray-700 rounded-lg p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('camera')}
                  className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:text-white text-xs font-medium"
                >
                  ← Back to Camera
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('review')}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  Proceed to Review & Audit →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: Review & Submit ── */}
        {activeTab === 'review' && (
          <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full space-y-4">
            {/* Submission Banner */}
            {submitSuccess ? (
              <div className="bg-emerald-950/90 border border-emerald-500 rounded-2xl p-6 text-center space-y-3 shadow-2xl">
                <div className="w-12 h-12 bg-emerald-500 text-black rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                  ✓
                </div>
                <h3 className="text-xl font-bold text-white">
                  Roof Inspection Dispatched Successfully!
                </h3>
                <p className="text-sm text-emerald-200">
                  Survey telemetry published to Cloud Pub/Sub topic{' '}
                  <code className="bg-black/50 px-2 py-0.5 rounded text-emerald-300">
                    spec-hunter-events
                  </code>
                  .
                </p>
                <div className="bg-black/60 rounded-xl p-3 text-xs text-gray-300 font-mono text-left space-y-1">
                  <p>
                    Event ID: <span className="text-emerald-400">{submitSuccess.eventId}</span>
                  </p>
                  <p>
                    Pub/Sub Message:{' '}
                    <span className="text-blue-300">{submitSuccess.messageId}</span>
                  </p>
                  <p>
                    Recipient: <span className="text-yellow-300">{submitSuccess.recipient}</span>
                  </p>
                  <p>
                    Photos Verified: <span className="text-white">{submitSuccess.totalPhotos}</span>
                  </p>
                </div>
                <div className="pt-2 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      onClose?.();
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg text-sm font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Target Email Dispatch Config */}
                <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                        Executive Report Recipient
                      </h4>
                      <p className="text-xs text-gray-400">
                        The Cloud Run worker will compile the inspection package and email it to:
                      </p>
                    </div>
                    <span className="text-[11px] bg-emerald-950 text-emerald-400 border border-emerald-600/40 px-2 py-0.5 rounded-full font-semibold">
                      Automated Pipeline
                    </span>
                  </div>
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="recipient@domain.com"
                    className="w-full bg-[#0D1520] border border-gray-700 rounded-lg px-3 py-2 text-sm text-emerald-300 font-medium focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Checklist Summary Card */}
                <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-2">
                  <div className="flex items-center justify-between border-b border-gray-700 pb-2">
                    <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                      Checklist Summary
                    </h4>
                    <button
                      type="button"
                      onClick={() => setActiveTab('checklist')}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Edit Notes
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400">Building Area:</span>
                      <p className="text-white font-medium">
                        {checklist.buildingSqFt
                          ? `${Number(checklist.buildingSqFt).toLocaleString()} sq ft`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400">Roof Area:</span>
                      <p className="text-white font-medium">
                        {checklist.roofSqFt
                          ? `${Number(checklist.roofSqFt).toLocaleString()} sq ft`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400">Est. Age:</span>
                      <p className="text-white font-medium">
                        {checklist.estimatedAge ? `${checklist.estimatedAge} yrs` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400">Membrane:</span>
                      <p className="text-white font-medium truncate">{checklist.membraneType}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Condition:</span>
                      <p className="text-white font-medium truncate">{checklist.conditionRating}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Warranty:</span>
                      <p className="text-white font-medium truncate">{checklist.warrantyStatus}</p>
                    </div>
                  </div>
                  {checklist.notes && (
                    <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-300">
                      <span className="text-gray-400">Notes: </span>
                      {checklist.notes}
                    </div>
                  )}
                </div>

                {/* 9-Tier Photos Audit */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                      Taxonomy Audit ({totalPhotosCount} photos staged)
                    </h4>
                    <button
                      type="button"
                      onClick={() => setActiveTab('camera')}
                      className="text-xs text-emerald-400 hover:text-emerald-300"
                    >
                      + Add More Photos
                    </button>
                  </div>

                  {submitError && (
                    <div className="p-3 bg-red-950/80 border border-red-700 rounded-xl text-red-200 text-xs">
                      {submitError}
                    </div>
                  )}

                  <div className="space-y-3">
                    {ROOF_INSPECTION_TIERS.map((tier) => {
                      const photos = capturedAssets[tier.id] || [];
                      return (
                        <div
                          key={tier.id}
                          className="bg-[#1A2332] rounded-xl border border-gray-700/80 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-white flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-gray-800 text-gray-300 inline-flex items-center justify-center text-[10px]">
                                {tier.badge}
                              </span>
                              <span>{tier.title}</span>
                              {tier.required && (
                                <span className="text-[10px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                                  Recommended
                                </span>
                              )}
                            </span>
                            <span className="text-gray-400 text-[11px]">
                              {photos.length} photo{photos.length !== 1 ? 's' : ''}
                            </span>
                          </div>

                          {photos.length === 0 ? (
                            <div className="py-2 text-center text-gray-500 text-xs">
                              No photo captured for this tier
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {photos.map((asset, pIdx) => (
                                <div
                                  key={asset.image_hash || pIdx}
                                  className="p-2 rounded-lg bg-gray-900 border border-gray-700/60 flex items-center gap-2.5"
                                >
                                  <div className="w-14 h-14 rounded-md bg-black border border-gray-800 overflow-hidden flex-none">
                                    <img
                                      src={asset.base64 || asset.storage_url}
                                      alt={asset.label}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <p className="text-white text-xs font-medium truncate">
                                        {asset.label}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => handleDeletePhoto(tier.id, pIdx)}
                                        className="text-gray-400 hover:text-red-400 p-0.5"
                                        title="Delete photo"
                                      >
                                        <svg
                                          className="w-3.5 h-3.5"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-mono mt-0.5 space-y-0.5">
                                      <p>
                                        SHA:{' '}
                                        <span className="text-blue-300">
                                          {formatSha256(asset.image_hash || asset.imageHash)}
                                        </span>
                                      </p>
                                      <p>
                                        Sharpness:{' '}
                                        <span className="text-emerald-300">
                                          {asset.sharpness_score ?? asset.sharpnessScore}%
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Final Submit Action Bar */}
                <div className="pt-3 pb-8">
                  <button
                    type="button"
                    onClick={handleSubmitSurvey}
                    disabled={isSubmitting || allStagedAssets.length === 0}
                    className={`w-full py-3.5 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-all ${
                      allStagedAssets.length > 0 && !isSubmitting
                        ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white active:scale-[0.99]'
                        : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Publishing to Pub/Sub & Worker...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Inspection & Email Report</span>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
