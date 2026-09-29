import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ASSET_TAXONOMY_STEPS } from '../../constants/photoTaxonomy.js';
import { useBlurDetection } from '../../hooks/useBlurDetection.js';
import { stageAssetPhoto } from '../../services/stagingService.js';
import { formatSha256 } from '../../utils/cryptoUtils.js';

/**
 * Guided Multi-Step Camera Capture Wizard with Client-Side Blur Detection
 *
 * Implements:
 * 1. 4-step asset photo taxonomy: overview, nameplate, electrical, mechanical.
 * 2. Visual target framing bounding boxes & reticle overlays per step.
 * 3. Real-time HTML5 Canvas Laplacian variance edge sharpness evaluator.
 * 4. Automatic SHA-256 image hashing and asynchronous GCP Pub/Sub staging.
 */
export default function GuidedCaptureWizard({
  isOpen,
  onClose,
  onComplete,
  equipmentNumber = '1',
  jobContext = {},
  initialStep = 'nameplate',
}) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [capturedAssets, setCapturedAssets] = useState({
    nameplate: [],
    overview: [],
    electrical: [],
  });
  const [streaming, setStreaming] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isStaging, setIsStaging] = useState(false);
  const [bypassBlur, setBypassBlur] = useState(false);
  const [showReviewDrawer, setShowReviewDrawer] = useState(false);
  const [flashFeedback, setFlashFeedback] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const activeStep = ASSET_TAXONOMY_STEPS[activeStepIndex] || ASSET_TAXONOMY_STEPS[0];
  const nameplateAsset = (capturedAssets.nameplate || [])[0];
  const hasNameplate = Boolean(nameplateAsset?.base64);
  const currentStepPhotos = capturedAssets[activeStep.id] || [];
  const totalPhotosCount = Object.values(capturedAssets).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0
  );

  const handleDeletePhoto = useCallback((taxId, idx) => {
    setCapturedAssets((prev) => {
      const list = prev[taxId] || [];
      return {
        ...prev,
        [taxId]: list.filter((_, i) => i !== idx),
      };
    });
  }, []);

  // Initialize active step if specified
  useEffect(() => {
    if (initialStep) {
      const idx = ASSET_TAXONOMY_STEPS.findIndex((s) => s.id === initialStep);
      if (idx !== -1) setActiveStepIndex(idx);
    }
  }, [initialStep]);

  // Real-time Laplacian blur detection hook
  const blurQuality = useBlurDetection({
    videoRef,
    isStreaming: streaming && isOpen,
    threshold: 110,
    intervalMs: 120,
    enabled: streaming && isOpen,
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
      console.error('[wizard:camera] Camera access error:', err);
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

  // Launch camera when modal opens
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  // Take snapshot with blur check and SHA-256 staging
  const handleTakeSnapshot = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Check blur quality at snapshot moment
    const frameQuality = blurQuality.checkCurrentFrame() || blurQuality;

    if (!bypassBlur && frameQuality.isBlurry) {
      // Trigger visual shake/warning feedback
      return;
    }

    // Capture high-res frame from video
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL('image/jpeg', 0.88);

    // Visual shutter flash effect
    setFlashFeedback(true);
    setTimeout(() => setFlashFeedback(false), 200);

    setIsStaging(true);

    try {
      const existingList = capturedAssets[activeStep.id] || [];
      const isSingle = !activeStep.multiPhoto;
      const photoIndex = isSingle ? 0 : existingList.length;

      // Stage asset, compute SHA-256, stamp badge, and dispatch telemetry
      const staged = await stageAssetPhoto({
        imageBase64: base64,
        taxonomy: activeStep.id,
        equipmentNumber,
        label: activeStep.suggestedLabel,
        photoIndex,
        sharpnessScore: frameQuality.sharpnessScore || 0,
        jobContext,
        metadata: {
          stepIndex: activeStepIndex,
          variance: frameQuality.variance,
        },
      });

      const newAsset = {
        taxonomy: activeStep.id,
        base64: staged.stampedBase64 || base64,
        rawBase64: base64,
        imageHash: staged.imageHash,
        storageUrl: staged.storageUrl,
        photoLabel: staged.photoLabel,
        sharpnessScore: frameQuality.sharpnessScore,
        timestamp: staged.timestamp,
        photoIndex,
      };

      // Update state with captured asset
      setCapturedAssets((prev) => {
        if (isSingle) {
          return { ...prev, [activeStep.id]: [newAsset] };
        }
        return {
          ...prev,
          [activeStep.id]: [...(prev[activeStep.id] || []), newAsset],
        };
      });

      // Auto-advance ONLY from Step 1 (Nameplate) to Step 2 (Overview).
      // On Steps 2 and 3, multiple photos are allowed so we do NOT auto-advance.
      if (activeStepIndex === 0) {
        setTimeout(() => {
          setActiveStepIndex(1);
        }, 350);
      }
    } catch (err) {
      console.error('[wizard:snapshot] Staging error:', err);
    } finally {
      setIsStaging(false);
    }
  }, [
    activeStep,
    activeStepIndex,
    blurQuality,
    bypassBlur,
    capturedAssets,
    equipmentNumber,
    jobContext,
  ]);

  // Finish wizard and hand off to parent
  const handleFinish = () => {
    stopCamera();
    const nameplateAsset = (capturedAssets.nameplate || [])[0];
    const supportingList = [];

    // Flatten all supporting photos from steps 2 & 3 (overview & electrical)
    for (const [tax, list] of Object.entries(capturedAssets)) {
      if (tax === 'nameplate' || !Array.isArray(list)) continue;
      for (const asset of list) {
        supportingList.push({
          label: asset.photoLabel,
          taxonomy: tax,
          url: asset.storageUrl || asset.base64,
          base64: asset.base64,
          imageHash: asset.imageHash,
          sharpnessScore: asset.sharpnessScore,
        });
      }
    }

    onComplete?.({
      nameplateImage: nameplateAsset?.rawBase64 || nameplateAsset?.base64,
      nameplateHash: nameplateAsset?.imageHash,
      supportingPhotos: supportingList,
      capturedAssets,
      equipmentNumber,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col select-none overflow-hidden font-sans">
      {/* ── Top Bar: Stepper & Controls ── */}
      <div className="flex-none bg-black/85 backdrop-blur border-b border-gray-800 px-4 pt-3 pb-2 z-20">
        <div className="flex items-center justify-between gap-2 max-w-xl mx-auto mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <h2 className="text-white text-sm font-semibold tracking-wide uppercase">
              Guided Unit #{equipmentNumber}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReviewDrawer(!showReviewDrawer)}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded-full border border-gray-700 flex items-center gap-1.5"
            >
              <span>Photos</span>
              <span className="bg-green-600 text-white rounded-full min-w-4 h-4 px-1 inline-flex items-center justify-center text-[10px] font-bold">
                {totalPhotosCount}
              </span>
            </button>
            <button
              onClick={() => {
                stopCamera();
                onClose?.();
              }}
              className="text-gray-400 hover:text-white p-1"
              aria-label="Close wizard"
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

        {/* ── Step Progress Indicator ── */}
        <div className="grid grid-cols-3 gap-1.5 max-w-xl mx-auto">
          {ASSET_TAXONOMY_STEPS.map((step, idx) => {
            const stepPhotos = capturedAssets[step.id] || [];
            const isCompleted = stepPhotos.length > 0;
            const isActive = idx === activeStepIndex;
            const stepDisplay =
              step.id === 'nameplate'
                ? '1. Nameplate'
                : step.id === 'overview'
                  ? '1a. Overview'
                  : '1b. Disconnect';
            return (
              <button
                key={step.id}
                onClick={() => setActiveStepIndex(idx)}
                className={`py-1.5 px-1 text-center rounded-lg transition-all flex flex-col items-center ${
                  isActive
                    ? 'bg-blue-600 text-white ring-1 ring-blue-400 font-semibold shadow-sm'
                    : isCompleted
                      ? 'bg-green-950/70 border border-green-700/80 text-green-300'
                      : 'bg-gray-900/80 text-gray-400 hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-1">
                  {isCompleted &&
                    (step.multiPhoto && stepPhotos.length > 1 ? (
                      <span className="w-4 h-4 rounded-full bg-green-500 text-black text-[10px] font-bold inline-flex items-center justify-center flex-shrink-0">
                        {stepPhotos.length}
                      </span>
                    ) : (
                      <svg
                        className="w-3.5 h-3.5 text-green-400 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ))}
                  <span className="text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">
                    {stepDisplay}
                  </span>
                </div>
                <span className="text-[9px] text-gray-400 font-normal">
                  {step.multiPhoto
                    ? stepPhotos.length > 0
                      ? `${stepPhotos.length} photo${stepPhotos.length !== 1 ? 's' : ''}`
                      : '(multi-photo)'
                    : '(required)'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Viewfinder Area ── */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-200 ${
            flashFeedback ? 'opacity-30' : 'opacity-100'
          }`}
        />

        {cameraError && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center z-30">
            <svg
              className="w-12 h-12 text-red-500 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-red-400 font-medium mb-4">{cameraError}</p>
            <button
              onClick={startCamera}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold"
            >
              Retry Camera
            </button>
          </div>
        )}

        {/* ── Dynamic Target Framing Bounding Box Overlay ── */}
        {streaming && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
            <div
              className={`relative border-2 transition-all duration-300 flex items-center justify-center ${
                activeStep.framingBox.shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
              }`}
              style={{
                width: `${activeStep.framingBox.widthPercent}%`,
                height: `${activeStep.framingBox.heightPercent}%`,
                borderColor: blurQuality.isSharp ? activeStep.framingBox.strokeColor : '#EF4444',
                boxShadow: `0 0 24px ${blurQuality.isSharp ? activeStep.framingBox.glowColor : 'rgba(239, 68, 68, 0.35)'}`,
              }}
            >
              {/* Corner Laser Brackets */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-white" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-white" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-white" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-white" />

              {/* Center Crosshair Reticle */}
              {activeStep.framingBox.reticle && (
                <div className="w-8 h-8 pointer-events-none opacity-60">
                  <div className="w-full h-0.5 bg-white/70 absolute top-1/2 -translate-y-1/2" />
                  <div className="h-full w-0.5 bg-white/70 absolute left-1/2 -translate-x-1/2" />
                </div>
              )}

              {/* Overlay Framing Label */}
              <div className="absolute bottom-2 bg-black/70 backdrop-blur text-white text-[11px] font-medium px-3 py-1 rounded-full border border-white/20">
                {activeStep.framingBox.overlayLabel}
              </div>
            </div>
          </div>
        )}

        {/* ── Real-Time Blur & Edge Sharpness HUD Badge ── */}
        {streaming && (
          <div className="absolute top-3 left-4 right-4 flex items-center justify-between gap-2 z-10 pointer-events-none">
            {/* Status Feedback Badge */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg text-xs font-semibold text-white backdrop-blur border transition-colors"
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

            {/* Sharpness Progress Meter */}
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

        {/* ── Active Multi-Photo Carousel / Thumbnail Strip ── */}
        {streaming && activeStep.multiPhoto && currentStepPhotos.length > 0 && (
          <div className="absolute top-14 left-4 right-4 z-20 flex items-center gap-2 overflow-x-auto py-1 px-2.5 bg-black/75 backdrop-blur rounded-xl border border-white/15 shadow-lg">
            <span className="text-[11px] font-semibold text-emerald-400 flex-shrink-0">
              {currentStepPhotos.length} photo{currentStepPhotos.length !== 1 ? 's' : ''}:
            </span>
            {currentStepPhotos.map((photo, pIdx) => (
              <div
                key={photo.imageHash || pIdx}
                className="relative flex-shrink-0 w-11 h-11 rounded-lg border border-white/40 overflow-hidden bg-black shadow"
              >
                <img
                  src={photo.base64}
                  alt={photo.photoLabel}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePhoto(activeStep.id, pIdx);
                  }}
                  className="absolute top-0 right-0 bg-red-600 hover:bg-red-500 text-white rounded-bl p-0.5"
                  title="Remove this photo"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

        {/* ── Instruction & Tips Banner ── */}
        <div className="absolute bottom-3 left-4 right-4 z-10 pointer-events-none flex justify-center">
          <div className="bg-black/75 backdrop-blur border border-gray-700/80 text-gray-200 text-xs px-4 py-2 rounded-xl text-center max-w-md shadow-md">
            <p className="font-semibold text-white mb-0.5">{activeStep.title}</p>
            <p className="text-[11px] text-gray-300">{activeStep.instruction}</p>
          </div>
        </div>
      </div>

      {/* ── Bottom Controls & Shutter Bar ── */}
      <div className="flex-none bg-black/90 backdrop-blur border-t border-gray-800 pt-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] z-20">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
          {/* Previous / Skip Step */}
          <button
            onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
            disabled={activeStepIndex === 0}
            className="w-12 h-12 rounded-full bg-gray-800 disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Previous step"
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

          {/* Shutter Capture Button */}
          <div className="flex flex-col items-center">
            <button
              onClick={handleTakeSnapshot}
              disabled={isStaging || (!bypassBlur && blurQuality.isBlurry)}
              className={`w-20 h-20 rounded-full border-4 flex items-center justify-center shadow-2xl transition-all duration-200 active:scale-90 ${
                isStaging
                  ? 'border-gray-500 bg-gray-700 animate-pulse'
                  : blurQuality.isSharp || bypassBlur
                    ? 'border-green-400 bg-white ring-4 ring-green-500/30'
                    : 'border-red-500 bg-gray-300 opacity-60'
              }`}
              aria-label="Take asset photo"
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
                  ? activeStep.multiPhoto && currentStepPhotos.length > 0
                    ? `+ Add Photo (${currentStepPhotos.length})`
                    : 'Snap Photo'
                  : 'Hold Steady'}
            </span>
          </div>

          {/* Next Step / Complete */}
          {activeStepIndex < ASSET_TAXONOMY_STEPS.length - 1 ? (
            <button
              onClick={() =>
                setActiveStepIndex((prev) => Math.min(ASSET_TAXONOMY_STEPS.length - 1, prev + 1))
              }
              className="w-12 h-12 rounded-full bg-gray-800 text-white flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Next step"
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
              onClick={handleFinish}
              disabled={!hasNameplate}
              className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform ${
                hasNameplate
                  ? 'bg-green-600 text-white shadow-lg'
                  : 'bg-gray-800 text-gray-500 opacity-50'
              }`}
              aria-label="Finish unit capture"
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

        {/* ── Sub-bar: Blur Override & Complete Button ── */}
        <div className="max-w-xl mx-auto flex items-center justify-between mt-2 pt-2 border-t border-gray-800/80 text-xs">
          <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bypassBlur}
              onChange={(e) => setBypassBlur(e.target.checked)}
              className="rounded bg-gray-800 border-gray-700 text-blue-500 focus:ring-0"
            />
            <span className="text-[11px]">Bypass blur lock</span>
          </label>

          {hasNameplate && (
            <button
              onClick={handleFinish}
              className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded-full font-semibold flex items-center gap-1"
            >
              <span>Finish & Analyze</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Slide-Over Review Drawer ── */}
      {showReviewDrawer && (
        <div className="absolute inset-0 bg-black/90 z-40 p-4 flex flex-col backdrop-blur animate-fadeIn">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-4">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <span>Captured Unit Assets</span>
              <span className="text-xs text-gray-400">({totalPhotosCount} staged)</span>
            </h3>
            <button
              onClick={() => setShowReviewDrawer(false)}
              className="text-gray-400 hover:text-white text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg"
            >
              Done
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4">
            {ASSET_TAXONOMY_STEPS.map((step) => {
              const stepPhotos = capturedAssets[step.id] || [];
              const stepTitle =
                step.id === 'nameplate'
                  ? '1. Nameplate Data Tag'
                  : step.id === 'overview'
                    ? '1a. Unit Overview (Multi-Photo)'
                    : '1b. Electrical Disconnect (Multi-Photo)';

              return (
                <div key={step.id} className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold px-1">
                    <span className="text-white flex items-center gap-1.5">
                      <span>{stepTitle}</span>
                      {step.required ? (
                        <span className="text-[10px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                          Required
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 font-normal">(optional)</span>
                      )}
                    </span>
                    <span className="text-gray-400 text-[11px]">
                      {stepPhotos.length} photo{stepPhotos.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {stepPhotos.length === 0 ? (
                    <div className="p-3 rounded-xl border border-gray-800 bg-gray-950/50 text-gray-500 text-xs text-center">
                      No photo captured yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {stepPhotos.map((asset, pIdx) => (
                        <div
                          key={asset.imageHash || pIdx}
                          className="p-3 rounded-xl border border-gray-700 bg-gray-900 flex items-center gap-3"
                        >
                          <div className="w-16 h-16 rounded-lg bg-black border border-gray-800 overflow-hidden flex-none flex items-center justify-center">
                            <img
                              src={asset.base64}
                              alt={asset.photoLabel}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-white text-xs font-semibold truncate">
                                {asset.photoLabel}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleDeletePhoto(step.id, pIdx)}
                                className="text-gray-400 hover:text-red-400 p-1 rounded hover:bg-gray-800 transition-colors"
                                title="Remove photo"
                              >
                                <svg
                                  className="w-4 h-4"
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
                            <div className="text-[11px] text-gray-400 mt-1 space-y-0.5 font-mono">
                              <p>
                                SHA:{' '}
                                <span className="text-blue-300">
                                  {formatSha256(asset.imageHash)}
                                </span>
                              </p>
                              <p>
                                Sharpness:{' '}
                                <span className="text-gray-300">{asset.sharpnessScore}%</span>
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

          <div className="pt-3 border-t border-gray-800">
            <button
              onClick={handleFinish}
              disabled={!hasNameplate}
              className={`w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${
                hasNameplate
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              <span>Done & Analyze Unit</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
