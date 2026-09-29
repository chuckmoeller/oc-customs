import React, { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { logOut } from './services/auth.js';
import { apiFetch } from './services/api.js';
import { uploadScanImage, base64ToBlob } from './services/storage.js';
import { createScan, updateScan } from './services/scans.js';
import {
  createJob,
  getJobByNumber,
  createDevice,
  mapAnalysisToDevice,
  linkScanToDevice,
  updateJob,
} from './services/jobs.js';
import { useOfflineQueue } from './services/offlineQueue.js';
import { syncOfflineQueue } from './services/sync.js';
import ScanHistory from './components/Camera/ScanHistory.jsx';
import JobList from './components/Jobs/JobList.jsx';
import { resolveTaxonomy, UNIDENTIFIED_CATEGORY } from './constants/categories.js';
import { resizeImageForAnalysis, stampLabelOnPhoto, isHeicImage, ensureJpegImage } from './utils/imageUtils.js';
import { useCamera } from './hooks/useCamera.js';
import { useJobContext } from './hooks/useJobContext.js';
import { useScanFields } from './hooks/useScanFields.js';
import { useQuickExport } from './hooks/useQuickExport.js';
import { useSupportingPhotos } from './hooks/useSupportingPhotos.js';
import { useJobPhotos } from './hooks/useJobPhotos.js';
import { catchTag } from './lib/tagCatcher.js';
import { stageAssetPhoto } from './services/stagingService.js';

const AnalyzingView = lazy(() => import('./views/AnalyzingView.jsx'));
const ScanView = lazy(() => import('./views/ScanView.jsx'));
const ResultView = lazy(() => import('./views/ResultView.jsx'));
const SupportingPromptView = lazy(() => import('./views/SupportingPromptView.jsx'));
const SupportingView = lazy(() => import('./views/SupportingView.jsx'));
const SyncPromptView = lazy(() => import('./views/SyncPromptView.jsx'));
const JobPhotosView = lazy(() => import('./views/JobPhotosView.jsx'));
const ProcessQueueView = lazy(() => import('./views/ProcessQueueView.jsx'));
const AnalyticsView = lazy(() => import('./views/AnalyticsView.jsx'));

// Views: "home" | "scan" | "analyzing" | "result" | "supporting-prompt" | "supporting" | "sync-prompt" | "job-photos" | "history" | "jobs" | "process-queue" | "analytics"

export default function App({ user }) {
  const [view, setView] = useState('scan');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [offlineModeEnabled, setOfflineModeEnabled] = useState(false);
  const [_syncProgress, setSyncProgress] = useState(null);
  const [processQueueIndex, setProcessQueueIndex] = useState(0);
  const [processQueuePreview, setProcessQueuePreview] = useState(null);

  // Capture mode toggle: 'guided' (4-tier wizard + blur detection) vs 'quick' (single-shot nameplate)
  const [captureMode, setCaptureModeState] = useState(() => {
    try {
      return localStorage.getItem('site_hunter_capture_mode') || 'guided';
    } catch {
      return 'guided';
    }
  });

  const setCaptureMode = useCallback((mode) => {
    setCaptureModeState(mode);
    try {
      localStorage.setItem('site_hunter_capture_mode', mode);
    } catch (e) {
      console.warn('[storage] Failed to save capture mode:', e);
    }
  }, []);

  const offlineQueueStore = useOfflineQueue();

  const {
    videoRef,
    canvasRef,
    fileInputRef,
    streaming,
    cameraError,
    startCamera,
    stopCamera,
    capturePhoto,
  } = useCamera();

  const {
    jobNumber,
    setJobNumber,
    jobName,
    setJobName,
    loadedJob,
    setLoadedJob,
    loadingJob,
    category,
    setCategory,
    subcategory,
    setSubcategory,
    boardMatches,
    setBoardMatches,
    showBoardPicker,
    setShowBoardPicker,
    asanaProject,
    setAsanaProject,
    asanaSections,
    setAsanaSections,
    selectedCategoryItem,
    setSelectedCategoryItem,
    equipmentNumber,
    setEquipmentNumber,
    boardIdRef,
    asanaSectionsRef,
    isAsanaMode,
    categoryOptions,
    subcategoryOptions,
    handleLoadJob,
    selectBoard,
    reset: resetJobContext,
  } = useJobContext({ setError });

  const {
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
    reset: resetScanState,
  } = useScanFields({ stopCamera });

  const {
    exportJobName,
    setExportJobName,
    exportJobNumber,
    setExportJobNumber,
    exportLoading,
    setExportLoading,
    exportError,
    setExportError,
    exportSuccess,
    setExportSuccess,
    showCelebration,
    setShowCelebration,
    exportStage,
    setExportStage,
    exportBoardMatches,
    setExportBoardMatches,
    exportSelectedBoard,
    setExportSelectedBoard,
    billingPullLoading,
    billingPullMessage,
    setBillingPullMessage,
    photoSortLoading,
    photoSortMessage,
    setPhotoSortMessage,
    handleExportSearch,
    handleExportConfirm,
    handlePullBilling,
    handleSortPhotos,
    showReadinessModal,
    setShowReadinessModal,
    readinessData,
    readinessLoading,
    readinessError,
    activeJobTarget,
    handleOpenReadiness,
    handleSyncAsana: handleQuickExportSync,
    syncLoading,
    syncProgress,
    syncStatus,
  } = useQuickExport();

  const {
    supportingPhotos,
    setSupportingPhotos,
    supportingLabel,
    setSupportingLabel,
    nameplateLabel,
    setNameplateLabel,
    syncDone,
    setSyncDone,
    supportingFileRef,
    handleAddSupportingPhoto,
    handleTakeSupportingPhoto,
    handleRemoveSupportingPhoto,
    reset: resetSupportingState,
  } = useSupportingPhotos({ capturePhoto, stopCamera, equipmentNumber });

  const {
    jobPhotos,
    setJobPhotos,
    jobPhotoLabel,
    setJobPhotoLabel,
    jobPhotoCategory,
    setJobPhotoCategory,
    jobPhotoSubcategory,
    setJobPhotoSubcategory,
    savingJobPhotos,
    jobPhotoFileRef,
    handleAddJobPhoto,
    handleTakeJobPhoto,
    handleRemoveJobPhoto,
    handleSaveJobPhotos,
  } = useJobPhotos({
    capturePhoto,
    stopCamera,
    loadedJob,
    setLoadedJob,
    jobNumber,
    jobName,
    asanaProject,
    setError,
  });

  // Initialize offline queue detection and load persisted queue
  useEffect(() => {
    const unsubscribe = offlineQueueStore.initOnlineDetection();
    offlineQueueStore.loadQueueFromDB();
    return unsubscribe;
  }, [offlineQueueStore]);

  // Subscribe to offline queue changes (triggers re-render on queue updates)
  useEffect(() => {
    const unsubscribe = useOfflineQueue.subscribe(
      (state) => state.queuedImages?.length || 0,
      () => {}
    );
    return unsubscribe;
  }, []);

  // Load queue photo preview from IndexedDB when processing queue
  useEffect(() => {
    if (view === 'process-queue' && offlineQueueStore.queuedImages.length > 0) {
      const photo = offlineQueueStore.queuedImages[processQueueIndex];
      if (photo) {
        offlineQueueStore.getImageBase64(photo.id).then((base64) => {
          setProcessQueuePreview(base64);
        });
      } else {
        setProcessQueuePreview(null);
      }
    }
  }, [view, processQueueIndex, offlineQueueStore.queuedImages.length, offlineQueueStore]);

  // Auto-derive Indoor Fan RLA from MCA and Compressor RLA when both are present.
  // Mirrors the Excel J45 formula: IF(OR(I="",K=""),"",I-1.25*K).
  // Only fills when fanRLA is empty so we don't overwrite an OCR/grounding/manual value.
  // For evaporators/unit coolers the formula degenerates to fan_rla = MCA / 1.25
  // (no separate compressor RLA on those units).
  useEffect(() => {
    if (fanRLA) return;
    const m = parseFloat(mca);
    if (!Number.isFinite(m) || m <= 0) return;
    const cat = (category || '').toLowerCase();
    const isEvap = cat.includes('evaporator') || cat.includes('unit cooler');
    let computed;
    if (isEvap) {
      computed = m / 1.25;
    } else {
      const c = parseFloat(compressorRLA);
      if (!Number.isFinite(c) || c <= 0) return;
      computed = m - 1.25 * c;
    }
    const rounded = Math.round(computed * 10) / 10;
    if (rounded > 0) setFanRLA(String(rounded));
  }, [mca, compressorRLA, fanRLA, category, setFanRLA]);

  // Reset only scan/analysis fields (keep job context)
  const resetScanFields = useCallback(() => {
    resetScanState();
    resetSupportingState();
    // stopCamera is called inside resetScanState
  }, [resetScanState, resetSupportingState]);

  const resetAll = useCallback(() => {
    resetScanFields();
    resetJobContext();
    setError(null);
    setView('scan');
  }, [resetScanFields, resetJobContext]);

  const handleReset = useCallback(() => {
    resetScanFields();
    setView('scan');
  }, [resetScanFields]);

  const takePhoto = useCallback(() => {
    const base64 = capturePhoto();
    if (!base64) return;
    stopCamera();

    // In Quick Scan mode, asynchronously stage the captured photo to Firebase Storage & GCP Pub/Sub (spec-hunter-events)
    stageAssetPhoto({
      imageBase64: base64,
      taxonomy: 'nameplate',
      equipmentNumber: equipmentNumber || '1',
      label: nameplateLabel || 'Nameplate',
      sharpnessScore: 0,
      jobContext: {
        jobNumber,
        jobName,
        asanaProjectGid: asanaProject?.gid || null,
        category,
        subcategory,
      },
      metadata: {
        captureMode: 'quick',
        source: 'camera',
      },
    }).catch((err) => {
      console.warn('[quick-scan:staging] Staging notice:', err.message);
    });

    handleAnalyzeRef.current?.(base64);
  }, [
    capturePhoto,
    stopCamera,
    equipmentNumber,
    nameplateLabel,
    jobNumber,
    jobName,
    asanaProject,
    category,
    subcategory,
  ]);

  const handleFileUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const isHeic =
        file.name?.toLowerCase().endsWith('.heic') ||
        file.name?.toLowerCase().endsWith('.heif') ||
        file.type?.toLowerCase().includes('heic') ||
        file.type?.toLowerCase().includes('heif');

      const reader = new FileReader();
      reader.onload = async () => {
        let base64 = reader.result;
        if (isHeic || isHeicImage(base64)) {
          base64 = await ensureJpegImage(base64);
        }

        // Asynchronously stage loaded file to Firebase Storage & GCP Pub/Sub
        stageAssetPhoto({
          imageBase64: base64,
          taxonomy: 'nameplate',
          equipmentNumber: equipmentNumber || '1',
          label: nameplateLabel || 'Nameplate',
          sharpnessScore: 0,
          jobContext: {
            jobNumber,
            jobName,
            asanaProjectGid: asanaProject?.gid || null,
            category,
            subcategory,
          },
          metadata: {
            captureMode: 'quick',
            source: 'file_upload',
          },
        }).catch((err) => {
          console.warn('[quick-scan:upload-staging] Staging notice:', err.message);
        });

        handleAnalyzeRef.current?.(base64);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [equipmentNumber, nameplateLabel, jobNumber, jobName, asanaProject, category, subcategory]
  );

  // Keep a ref to handleAnalyze so takePhoto/handleFileUpload always get the latest version
  const handleAnalyzeRef = useRef(null);

  const handleGuidedCaptureComplete = useCallback(
    (result) => {
      const { nameplateImage, supportingPhotos: stagedSupporting } = result || {};
      if (stagedSupporting && stagedSupporting.length > 0) {
        setSupportingPhotos(stagedSupporting);
      }
      if (nameplateImage) {
        handleAnalyzeRef.current?.(nameplateImage);
      } else if (stagedSupporting && stagedSupporting.length > 0) {
        setView('supporting');
      }
    },
    [setSupportingPhotos, setView]
  );

  // --- Canonical taxonomy (Firebase = system of record) ---------------------
  // Resolve a raw scan/grounding classification into the canonical Submission
  // Form 3.0 taxonomy and set it locally. `subcategoryDetail` preserves the precise
  // equipment class when subcategory collapses to "Other"; it is Firestore-only
  // (never synced to Asana). This does NOT touch Asana placement — in Asana mode
  // the caller runs its own section/task matching, so Asana sync is unchanged.
  // Used as the fallback when no Asana section matches and in local/offline mode.
  const applyLocalTaxonomy = (rawCategory, rawSubcategory) => {
    const tax = resolveTaxonomy(rawCategory, rawSubcategory, '');
    if (!tax.category) return false; // unknown class — leave for manual selection
    setCategory(tax.category);
    if (tax.subcategory) setSubcategory(tax.subcategory);
    setSubcategoryDetail(tax.subcategoryDetail || '');
    return true;
  };

  // Asana mode only: the detected class matched no section. Route to the
  // "Unidentified-Needs Research" triage category so the item syncs cleanly
  // instead of writing an unmatched value that errors downstream. The detected
  // class is preserved in subcategoryDetail (Firestore-only) for later research,
  // and we place on the board's triage group if one exists.
  const applyUnidentified = (rawCategory, rawSubcategory) => {
    setCategory(UNIDENTIFIED_CATEGORY);
    const detected = [rawCategory, rawSubcategory].map((s) => (s || '').trim()).filter(Boolean);
    // Park the AI's unconfirmed best guess in the subcategory (the triage subitem)
    // so a human can confirm/correct it under the Unidentified parent; this also
    // syncs to Asana's subcategory field. Full detail stays in subcategoryDetail.
    setSubcategory(detected[0] || '');
    setSubcategoryDetail(detected.join(' / '));
    const triage = (asanaSectionsRef.current || []).find((c) => /unidentified/i.test(c.name || ''));
    if (triage) setSelectedCategoryItem(triage);
  };

  // --- Async ingest (Phase 6): poll the spec-hunter job for deep-enriched
  // fields and fill any empty slots, mirroring the grounding merge's
  // fill-empty-only semantics so quick + manual values are never overwritten. ---
  const applyEnrichedFields = (f, sources) => {
    if (!f) return;
    if (f.equipment_type) setEquipmentType((prev) => prev || f.equipment_type);
    if (f.manufacturer) setManufacturer((prev) => prev || f.manufacturer);
    if (f.voltage) setVoltage((prev) => prev || f.voltage);
    if (f.tonnage) setTonnage((prev) => prev || f.tonnage);
    if (f.seer) setSeer((prev) => prev || f.seer);
    if (f.eer) setEer((prev) => prev || f.eer);
    if (f.iplv) setIplv((prev) => prev || f.iplv);
    if (f.btu)
      setTonnage((prev) => prev || String(Math.round((parseFloat(f.btu) / 12000) * 10) / 10));
    if (f.weight) setWeight((prev) => prev || f.weight);
    if (f.refrigerant_type) setRefrigerantType((prev) => prev || f.refrigerant_type);
    if (f.fan_count) setFanCount((prev) => prev || f.fan_count);
    if (f.evaporator_count) setEvaporatorCount((prev) => prev || f.evaporator_count);
    if (f.motor_type) setMotorType((prev) => prev || f.motor_type);
    if (f.compressor_count) setCompressorCount((prev) => prev || f.compressor_count);
    if (f.compressor_hp) setCompressorHP((prev) => prev || f.compressor_hp);
    if (f.compressor_rla) setCompressorRLA((prev) => prev || f.compressor_rla);
    if (f.compressor_lra) setCompressorLRA((prev) => prev || f.compressor_lra);
    if (f.fan_rla) setFanRLA((prev) => prev || f.fan_rla);
    if (f.fan_phases || f.fan_ph) setFanPH((prev) => prev || f.fan_phases || f.fan_ph);
    if (f.compressor_ph) setCompressorPH((prev) => prev || f.compressor_ph);
    if (f.min_circuit_ampacity) setMca((prev) => prev || f.min_circuit_ampacity);
    if (f.max_fuse_or_breaker) setMocp((prev) => prev || f.max_fuse_or_breaker);
    if (f.refrigerant_charge) setRefrigerantCharge((prev) => prev || f.refrigerant_charge);
    if (f.oil_type) setOilType((prev) => prev || f.oil_type);
    if (f.design_pressure_high) setDesignPressureHigh((prev) => prev || f.design_pressure_high);
    if (f.design_pressure_low) setDesignPressureLow((prev) => prev || f.design_pressure_low);
    if (f.ahri_number) setAhriNumber((prev) => prev || f.ahri_number);
    if (f.fan_fla) setFanFla((prev) => prev || f.fan_fla);
    if (f.manual_url) setManualUrl((prev) => prev || f.manual_url);
    if (sources?.length > 0) setEnrichment({ sources });
  };

  // Manual model lookup — when OCR can't read a nameplate (common on chiller
  // plates), the tech types the model and we enrich from it via the same
  // grounding pipeline. Fills empty fields only (applyEnrichedFields).
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const handleModelLookup = async () => {
    const model = (modelNumber || '').trim();
    if (!model) {
      setLookupError('Enter a model number first');
      return;
    }
    setLookupError('');
    setLookupLoading(true);
    try {
      const r = await apiFetch('/api/specs/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturer: manufacturer || undefined,
          model_number: model,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `Lookup failed (${r.status})`);
      }
      const data = await r.json();
      const f = data.fields || {};
      if (!f || Object.keys(f).length === 0) {
        setLookupError('No specs found for that model — check the number');
      } else {
        applyEnrichedFields(f, data.sources);
      }
    } catch (err) {
      setLookupError(err.message || 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };

  // Efficiency upgrade recommendations (site-hunter-agent-router) — streams SSE status
  // updates while the backend chains vision extraction -> spec lookup -> LLM analysis,
  // then lands on IntelliHVAC/EnerG2/refrigerant-replacement recommendations + any
  // fields that need field verification before presenting to the customer.
  const [recLoading, setRecLoading] = useState(false);
  const [recStatus, setRecStatus] = useState('');
  const [recError, setRecError] = useState('');
  const [recommendations, setRecommendations] = useState(null);
  const [requiresReview, setRequiresReview] = useState(null);

  const handleGetRecommendations = async () => {
    if (!imageBase64) return;
    setRecLoading(true);
    setRecError('');
    setRecStatus('');
    setRecommendations(null);
    setRequiresReview(null);
    try {
      const response = await apiFetch('/api/agent/analyze-equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType: 'image/jpeg',
          notes: notes || undefined,
        }),
      });
      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '');
        let errMsg = 'Could not get recommendations';
        try {
          errMsg = JSON.parse(text).error || errMsg;
        } catch {
          /* non-JSON body */
        }
        throw new Error(errMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sepIndex;
        while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);
          const eventMatch = rawEvent.match(/^event: (.+)$/m);
          const dataMatch = rawEvent.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;
          const eventType = eventMatch[1].trim();
          const data = JSON.parse(dataMatch[1]);
          if (eventType === 'status') {
            setRecStatus(data.message);
          } else if (eventType === 'complete') {
            setRecommendations(data.recommendations || []);
            setRequiresReview(data.requires_review || []);
          } else if (eventType === 'error') {
            throw new Error(`${data.detail} (stage: ${data.stage})`);
          }
        }
      }
    } catch (err) {
      setRecError(err.message || 'Could not get recommendations');
    } finally {
      setRecLoading(false);
      setRecStatus('');
    }
  };

  // Holds the in-flight enrichment promise so save can wait for it ("wait for
  // full"). Null when nothing is enriching.
  const enrichmentPromiseRef = useRef(null);
  // Latest enriched fields (full.data) — read at save time to bypass React
  // stale-closure, so the saved/synced device carries deep fields even if the
  // user saved while enrichment was still in flight.
  const latestEnrichedRef = useRef(null);

  const pollEnrichmentJob = (jobId, scanStart) => {
    setGroundingLoading(true);
    const p = (async () => {
      try {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          let res;
          try {
            const r = await apiFetch(`/api/gemini/job/${encodeURIComponent(jobId)}`);
            if (!r.ok) continue;
            res = await r.json();
          } catch {
            continue;
          }
          if (res.status === 'complete') {
            if (res.full?.data) {
              latestEnrichedRef.current = res.full.data;
              applyEnrichedFields(
                { ...res.full.data, model_match_confirmed: res.full.model_match_confirmed },
                res.full.sources
              );
            }
            return;
          }
          if (res.status === 'failed' || res.status === 'not_found') {
            console.warn(`[async] enrichment ${res.status}:`, res.error || '');
            return;
          }
        }
        console.warn('[async] enrichment poll timed out');
      } finally {
        setGroundingLoading(false);
        setScanTime(((Date.now() - scanStart) / 1000).toFixed(1));
        enrichmentPromiseRef.current = null;
      }
    })();
    enrichmentPromiseRef.current = p;
    return p;
  };

  // --- AI Analysis ---
  const handleAnalyze = async (base64, { forceOnline = false } = {}) => {
    const resized = await resizeImageForAnalysis(base64);
    setImageBase64(resized);
    setView('analyzing');
    setError(null);
    setScanTime(null);
    // Clear any prior scan's enrichment so it can't leak into this one.
    enrichmentPromiseRef.current = null;
    latestEnrichedRef.current = null;
    const scanStart = Date.now();

    try {
      if (offlineModeEnabled && !forceOnline) {
        await offlineQueueStore.addImageToQueue(base64, {
          category,
          subcategory,
          timestamp: new Date().toISOString(),
        });
        setError(null);
        setTimeout(() => {
          setView('scan');
        }, 500);
        return;
      }

      const response = await apiFetch('/api/gemini/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: resized,
          context: { category, subcategory },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        let errMsg = 'Analysis failed';
        try {
          errMsg = JSON.parse(text).error || errMsg;
        } catch {
          /* non-JSON body */
        }
        throw new Error(errMsg);
      }

      const text = await response.text();
      const result = JSON.parse(text);
      const data = result.data || result.equipment || result || {};
      const missingFields = result.missingFields || [];
      setScanMissingFields(missingFields);
      if (result.mfg_year) {
        setMfgYear(result.mfg_year);
        setMfgYearSource(result.mfg_year_source || null);
        setAge(result.age ?? new Date().getFullYear() - result.mfg_year);
      } else {
        setMfgYear(null);
        setMfgYearSource(null);
        setAge(null);
      }
      setAnalysis(data);
      setAnalysisProvider('gemini');

      const extract = (keys) => {
        if (!data || typeof data === 'string') return '';
        for (const key of keys) {
          if (data[key] !== undefined && data[key] !== null && String(data[key]).trim() !== '') {
            return String(data[key]).trim();
          }
        }
        return '';
      };

      setEquipmentType(extract(['equipment_type', 'equipmentType', 'type']));
      const extractedMfg = extract(['manufacturer', 'mfg', 'brand', 'make', 'mfd_fab']);
      const extractedModel = extract(['model_number', 'model_no', 'modelNumber', 'model']);
      setManufacturer(extractedMfg);
      setModelNumber(extractedModel);

      // ── Deterministic Tag Catcher fast-path (ASHRAE 205 instant resolution) ──
      const fastMatch = catchTag({ mfg: extractedMfg, model: extractedModel });
      if (fastMatch) {
        if (data?.tonnage) {
          const existingTon = parseFloat(data.tonnage);
          if (
            existingTon > 0 &&
            Math.abs(existingTon - fastMatch.nominal_cooling_tons) /
              fastMatch.nominal_cooling_tons >
              0.05
          ) {
            console.warn(
              `[App] Fast-path correcting conflicting VLM tonnage ${existingTon}T -> ${fastMatch.nominal_cooling_tons}T`
            );
            if (!data.original_tonnage) data.original_tonnage = String(existingTon);
            data.tonnage = String(fastMatch.nominal_cooling_tons);
          }
        } else if (fastMatch.nominal_cooling_tons) {
          data.tonnage = String(fastMatch.nominal_cooling_tons);
        }
        if (!data.seer && fastMatch.efficiency_seer) {
          data.seer = String(fastMatch.efficiency_seer);
        }
        data.ashrae_205_class = fastMatch.ashrae_205_class;
        data.model_match_confirmed = true;
        data.model_match_source = 'Deterministic ASHRAE 205 Fast-Path';
        data.matched_base_model = fastMatch.model_number;
        result.model_match_confirmed = true;
        result.model_match_source = 'Deterministic ASHRAE 205 Fast-Path';
        console.warn('[fast-path] Matched:', fastMatch);
      }
      setSerialNumber(extract(['serial_number', 'serial_no', 'serialNumber', 'serial']));
      setVoltage(extract(['voltage', 'volts', 'rated_voltage']));
      const rawTonnage = extract(['tonnage', 'tons', 'capacity', 'size']);
      const rawBtu = extract(['btu', 'btu_h', 'btuh']);
      const initialTonnage =
        rawTonnage || (rawBtu ? String(Math.round((parseFloat(rawBtu) / 12000) * 10) / 10) : '');
      setTonnage(initialTonnage);
      const initialOriginal =
        data?.original_tonnage || extract(['original_tonnage', 'originalTonnage']) || initialTonnage;
      setOriginalTonnage(initialOriginal);
      setTonnageOverride(false);
      setOverrideReason('');
      setOverriddenAt(null);
      setCompressorCount(extract(['compressor_count', 'num_compressors', 'number_of_compressors']));
      setCompressorHP(extract(['compressor_hp', 'compressorHP', 'comp_hp']));
      setCompressorRLA(extract(['compressor_rla', 'compressorRLA', 'comp_rla']));
      setCompressorRLAEstimated(!!data.compressor_rla_estimated);
      setCompressorLRA(extract(['compressor_lra', 'compressorLRA', 'comp_lra']));
      setCompressorPH(extract(['compressor_ph', 'phase', 'ph']));
      setMca(extract(['min_circuit_ampacity', 'mca', 'MCA', 'min_circuit_amps']));
      setMocp(
        extract([
          'max_fuse_or_breaker',
          'mocp',
          'MOCP',
          'max_fuse',
          'max_breaker',
          'max_over_current',
        ])
      );
      setFanRLA(extract(['fan_rla', 'fanRLA', 'outdoor_fan_rla']));
      setFanPH(extract(['fan_phases', 'fan_ph', 'fanPH', 'fanPhase', 'compressor_ph', 'phase', 'ph']));
      setFanCount(extract(['fan_count', 'num_fans', 'number_of_fans']));
      setEvaporatorCount(extract(['evaporator_count', 'num_evaporators']));
      setMotorType(extract(['motor_type', 'motorType', 'fan_motor_type']));
      setAoe(extract(['aoe', 'area_of_effect', 'location', 'area']));
      setSeer(extract(['seer']));
      setEer(extract(['eer']));
      setIplv(extract(['iplv', 'iplv_ip', 'IPLV']));
      setWeight(extract(['weight']));
      setRefrigerantType(extract(['refrigerant_type', 'refrigerant']));
      setRefrigerantCharge(extract(['refrigerant_charge']));
      setOilType(extract(['oil_type']));
      setDesignPressureHigh(extract(['design_pressure_high']));
      setDesignPressureLow(extract(['design_pressure_low']));
      setAhriNumber(extract(['ahri_number', 'ahri_cert', 'ahri']));
      setFanFla(extract(['fan_fla', 'fanFLA', 'fan_full_load_amps']));
      setManualUrl(extract(['manual_url', 'manualUrl', 'installation_manual_url']) || '');

      const explicitNotes = extract(['notes', 'remarks']);
      const additionalData = data?.additional_data || data?.additionalData || {};
      let notesParts = [];
      if (explicitNotes) notesParts.push(explicitNotes);
      if (typeof additionalData === 'object' && Object.keys(additionalData).length > 0) {
        const lines = Object.entries(additionalData)
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
        if (lines.length > 0) notesParts.push(lines.join('\n'));
      } else if (typeof additionalData === 'string' && additionalData) {
        notesParts.push(additionalData);
      }
      setNotes(notesParts.join('\n'));

      const model = extract(['model_number', 'model_no', 'modelNumber', 'model']);
      const mfg = extract(['manufacturer', 'mfg', 'brand']);
      setDeviceName(model ? `${mfg ? mfg + ' ' : ''}${model}` : '');

      // Auto-map AI category → Asana section (or hardcoded fallback)
      const currentAsanaSections = asanaSectionsRef.current;
      const currentIsAsanaMode = currentAsanaSections.length > 0;
      if (!category) {
        const aiCategory = extract(['category', 'equipment_type', 'type']) || '';
        const aiSubcategory = extract(['subcategory', 'equipment_subtype', 'subtype']) || '';
        const aiText = `${aiCategory} ${aiSubcategory}`.toLowerCase();

        if (currentIsAsanaMode && currentAsanaSections.length > 0) {
          let matchedCategory = null;
          let matchedSub = null;

          for (const cat of currentAsanaSections) {
            if (!cat.tasks?.length) continue;
            const sub = cat.tasks.find((s) => {
              if (!s.name) return false;
              const sLower = s.name.toLowerCase();
              const aiCatLower = aiCategory.toLowerCase();
              const aiSubLower = aiSubcategory.toLowerCase();
              return (
                sLower === aiCatLower ||
                sLower === aiSubLower ||
                aiText.includes(sLower) ||
                sLower.includes(aiCatLower)
              );
            });
            if (sub) {
              matchedCategory = cat;
              matchedSub = sub;
              break;
            }
          }

          if (!matchedCategory) {
            // NOTE: "condensing unit"/"condenser"/"condensing" are NOT in HVAC_KEYWORDS —
            // per NAMEPLATE_PROMPT semantics, "Condensing Unit" = refrigeration device
            // (HVAC outdoor units are classified as "Split System" by Gemini).
            const HVAC_KEYWORDS = [
              'rooftop',
              'rtu',
              'split system',
              'chiller',
              'boiler',
              'air handler',
              'cooling tower',
              'heat pump',
              'furnace',
              'ahu',
              'vrf',
              'vrv',
              'ptac',
              'vtac',
              'package unit',
              'air conditioner',
              'ac unit',
              'hvac',
              'mini-split',
              'multi-split',
              'fan coil',
              'doas',
              'make-up air',
              'mau',
              'tonnage',
              'seer',
              'air conditioning',
            ];
            const COLD_KEYWORDS = [
              'walk-in',
              'walk in',
              'reach-in',
              'reach in',
              'cooler',
              'freezer',
              'refrigerator',
              'refrigerated',
              'cold storage',
              'ice machine',
              'evaporator',
              'unit cooler',
              'condensing unit',
              'condenser',
              'condensing',
              'compressor rack',
              'refrigeration rack',
              'beverage',
              'display case',
              'glass door',
              'blast',
              'prep table',
              'cold',
              'refrigeration',
            ];

            const isHVAC = HVAC_KEYWORDS.some((kw) => aiText.includes(kw));
            const isCold = COLD_KEYWORDS.some((kw) => aiText.includes(kw));

            if (isHVAC) {
              matchedCategory = currentAsanaSections.find((c) =>
                c.name.toLowerCase().includes('hvac')
              );
            } else if (isCold) {
              matchedCategory = currentAsanaSections.find((c) => {
                const n = c.name.toLowerCase();
                return (
                  n.includes('cold') ||
                  n.includes('refriger') ||
                  n.includes('cooler') ||
                  n.includes('freezer') ||
                  n.includes('walk') ||
                  n.includes('evaporator') ||
                  n.includes('unit cooler') ||
                  n.includes('ice machine') ||
                  n.includes('condenser') ||
                  n.includes('condensing')
                );
              });
            }
            if (!matchedCategory) {
              matchedCategory = currentAsanaSections.find(
                (c) =>
                  aiText.includes(c.name.toLowerCase()) ||
                  c.name.toLowerCase().includes(aiCategory.toLowerCase())
              );
            }
          }

          if (!matchedCategory) {
            // No Asana section matched — route to the triage category so the
            // item syncs cleanly instead of an unmatched value erroring downstream.
            applyUnidentified(aiCategory, aiSubcategory);
          } else if (matchedCategory) {
            setCategory(matchedCategory.name);
            setSelectedCategoryItem(matchedCategory);

            if (matchedSub) {
              setSubcategory(matchedSub.name);
            } else if (matchedCategory.tasks?.length > 0) {
              const tasks = matchedCategory.tasks;
              const AI_TO_ASANA = [
                [
                  ['rooftop unit', 'rooftop', 'rtu', 'package unit', 'packaged unit'],
                  ['rtu', 'rooftop', 'roof top'],
                ],
                [
                  ['split system', 'split', 'condensing unit', 'outdoor unit'],
                  ['split system', 'split'],
                ],
                [['chiller', 'liquid chiller'], ['chiller']],
                [['boiler', 'steam boiler', 'hot water boiler'], ['boiler']],
                [['ptac', 'package terminal'], ['ptac']],
                [['vtac'], ['vtac']],
                [
                  ['vrf', 'vrv', 'variable refrigerant'],
                  ['vrf', 'vrv'],
                ],
                [['heat pump'], ['heat pump']],
                [['fan coil', 'fcu'], ['fan coil']],
                [
                  ['condensing unit', 'condenser', 'condensing'],
                  ['condensing unit', 'condensing', 'condenser'],
                ],
                [
                  ['evaporator', 'unit cooler', 'evaporator coil'],
                  ['evaporator', 'unit cooler'],
                ],
                [
                  ['refrigeration rack', 'compressor rack'],
                  ['rack', 'refrigeration'],
                ],
                [
                  ['unit cooler', 'evaporator coil'],
                  ['unit cooler', 'evaporator'],
                ],
                [
                  ['walk-in cooler', 'walk in cooler'],
                  ['walk-in cooler', 'walk in cooler', 'cooler'],
                ],
                [
                  ['walk-in freezer', 'walk in freezer'],
                  ['walk-in freezer', 'walk in freezer', 'freezer'],
                ],
                [['ice machine'], ['ice machine', 'ice']],
                [
                  ['reach-in cooler', 'reach-in refrigerator'],
                  ['reach-in cooler', 'reach-in refrigerator'],
                ],
                [['reach-in freezer'], ['reach-in freezer']],
                [
                  ['reach-in', 'refrigerator', 'display'],
                  ['reach-in', 'refrigerator', 'display'],
                ],
                [['thermostat', 'controller'], ['thermostat']],
              ];

              let foundSub = tasks.find((s) => {
                const sLower = s.name.toLowerCase();
                return (
                  aiText.includes(sLower) ||
                  sLower.includes(aiSubcategory.toLowerCase()) ||
                  sLower === aiCategory.toLowerCase() ||
                  aiCategory.toLowerCase().includes(sLower)
                );
              });

              if (!foundSub) {
                for (const [aiKeywords, asanaKeywords] of AI_TO_ASANA) {
                  if (aiKeywords.some((kw) => aiText.includes(kw))) {
                    foundSub = tasks.find((s) => {
                      const sLower = s.name.toLowerCase();
                      return asanaKeywords.some((mk) => sLower.includes(mk) || mk.includes(sLower));
                    });
                    if (foundSub) break;
                  }
                }
              }

              if (foundSub) setSubcategory(foundSub.name);
              else if (aiSubcategory) setSubcategory(aiSubcategory);
            }
          }
        } else {
          // Local/offline mode (no Asana project loaded) — canonical taxonomy.
          applyLocalTaxonomy(aiCategory, aiSubcategory);
        }
      }

      setView('result');

      // Step 2: ENERGY STAR lookup — fires in parallel with grounding, no blocking
      const modelNum = data.model_number || data.model_no || data.modelNumber || '';
      const mfgName = data.manufacturer || data.mfg || data.brand || '';

      if (modelNum) {
        setEnergyStarLoading(true);
        apiFetch('/api/specs/energystar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_number: modelNum, category: data.category || '' }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((result) => {
            if (result?.certified) setEnergyStar(result);
          })
          .catch((err) => console.warn('[energystar] lookup failed:', err.message))
          .finally(() => setEnergyStarLoading(false));
      }

      // Skip the secondary grounding pass only when spec-hunter already grounded
      // with a confirmed model match — the Node.js gemini path would just repeat
      // the same work and add ~25s of latency for no new fields.
      //
      // Chillers are NOT skipped: groundEquipmentSpecs() in server/routes/gemini.js
      // has a dedicated chiller branch (isChillerGround — Trane/Carrier/York
      // engineering-guide search hints, EER/IPLV prompting), so chillers ground
      // correctly via this path. They were previously skipped here because that
      // branch didn't exist yet; combined with the ground:false quick fix that
      // left chillers OCR-only. Grounding is non-blocking, so an obscure industrial
      // chiller that isn't web-indexed simply resolves with no new fields.
      if (result._jobId) {
        // Async ingest: deep enrichment is queued server-side. Poll the job and
        // fill enriched fields when it completes — quick fields already rendered.
        pollEnrichmentJob(result._jobId, scanStart);
      } else {
        const skipSecondaryGrounding = result.model_match_confirmed === true;
        if ((modelNum || mfgName) && missingFields.length > 0 && !skipSecondaryGrounding) {
          setGroundingLoading(true);
          apiFetch('/api/gemini/ground', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              manufacturer: mfgName,
              model_number: modelNum,
              category: data.category || '',
              subcategory: data.subcategory || '',
              missingFields,
            }),
          })
            .then((r) => {
              if (!r.ok) {
                console.warn(`Grounding request failed: ${r.status}`);
                return null;
              }
              return r.json();
            })
            .then((groundResult) => {
              if (!groundResult?.fields) return;
              const f = groundResult.fields;

              // Classification verification — map grounding result through Asana sections
              if (f.category) {
                const groundCat = f.category;
                const groundSub = f.subcategory || '';
                const groundText = `${groundCat} ${groundSub}`.toLowerCase();
                const cats = asanaSectionsRef.current;
                const inAsanaMode = cats.length > 0;

                if (inAsanaMode) {
                  let matchedCat = null;
                  let matchedSub = null;

                  for (const cat of cats) {
                    if (!cat.tasks?.length) continue;
                    const sub = cat.tasks.find((s) => {
                      if (!s.name) return false;
                      const sLower = s.name.toLowerCase();
                      return (
                        sLower === groundCat.toLowerCase() ||
                        sLower === groundSub.toLowerCase() ||
                        groundText.includes(sLower) ||
                        sLower.includes(groundCat.toLowerCase()) ||
                        groundCat.toLowerCase().includes(sLower)
                      );
                    });
                    if (sub) {
                      matchedCat = cat;
                      matchedSub = sub;
                      break;
                    }
                  }

                  if (!matchedCat) {
                    // NOTE: "condenser"/"condensing" are in COLD_KW — per NAMEPLATE_PROMPT
                    // semantics, "Condensing Unit" = refrigeration device (HVAC outdoor units = "Split System").
                    const HVAC_KW = [
                      'rooftop',
                      'rtu',
                      'split',
                      'chiller',
                      'boiler',
                      'air handler',
                      'heat pump',
                      'furnace',
                      'vrf',
                      'vrv',
                      'ptac',
                      'fan coil',
                    ];
                    const COLD_KW = [
                      'walk-in',
                      'walk in',
                      'reach-in',
                      'reach in',
                      'cooler',
                      'freezer',
                      'refrigerator',
                      'refrigerated',
                      'cold storage',
                      'ice machine',
                      'evaporator',
                      'unit cooler',
                      'condensing unit',
                      'condenser',
                      'condensing',
                      'compressor rack',
                      'refrigeration rack',
                      'refrigeration',
                    ];
                    const isHVAC = HVAC_KW.some((kw) => groundText.includes(kw));
                    const isCold = COLD_KW.some((kw) => groundText.includes(kw));
                    if (isCold) {
                      matchedCat = cats.find((c) => {
                        const n = c.name.toLowerCase();
                        return (
                          n.includes('cold') ||
                          n.includes('refriger') ||
                          n.includes('cooler') ||
                          n.includes('freezer') ||
                          n.includes('walk') ||
                          n.includes('evaporator') ||
                          n.includes('unit cooler') ||
                          n.includes('ice machine') ||
                          n.includes('condenser') ||
                          n.includes('condensing')
                        );
                      });
                    } else if (isHVAC) {
                      matchedCat = cats.find((c) => c.name.toLowerCase().includes('hvac'));
                    }
                    if (!matchedCat) {
                      matchedCat = cats.find(
                        (c) =>
                          groundText.includes(c.name.toLowerCase()) ||
                          c.name.toLowerCase().includes(groundCat.toLowerCase())
                      );
                    }
                  }

                  if (!matchedCat) {
                    // No Asana section matched — route to the triage category.
                    applyUnidentified(groundCat, groundSub);
                  } else if (matchedCat) {
                    setCategory(matchedCat.name);
                    setSelectedCategoryItem(matchedCat);
                    if (matchedSub) {
                      setSubcategory(matchedSub.name);
                    } else if (matchedCat.tasks?.length > 0) {
                      const AI_TO_ASANA_G = [
                        [
                          ['rooftop unit', 'rooftop', 'rtu', 'package unit'],
                          ['rtu', 'rooftop', 'roof top'],
                        ],
                        [
                          ['split system', 'split'],
                          ['split system', 'split'],
                        ],
                        [['chiller'], ['chiller']],
                        [['boiler'], ['boiler']],
                        [['ptac'], ['ptac']],
                        [['vtac'], ['vtac']],
                        [
                          ['vrf', 'vrv'],
                          ['vrf', 'vrv'],
                        ],
                        [['heat pump'], ['heat pump']],
                        [['fan coil'], ['fan coil']],
                        [
                          ['condensing unit', 'condenser', 'condensing'],
                          ['condensing unit', 'condensing', 'condenser'],
                        ],
                        [
                          ['evaporator', 'unit cooler', 'evaporator coil'],
                          ['evaporator', 'unit cooler'],
                        ],
                        [
                          ['refrigeration rack', 'compressor rack'],
                          ['rack', 'refrigeration'],
                        ],
                        [
                          ['walk-in cooler', 'walk in cooler'],
                          ['walk-in cooler', 'cooler'],
                        ],
                        [
                          ['walk-in freezer', 'walk in freezer'],
                          ['walk-in freezer', 'freezer'],
                        ],
                        [['ice machine'], ['ice machine', 'ice']],
                        [
                          ['reach-in cooler', 'reach-in refrigerator'],
                          ['reach-in cooler', 'reach-in refrigerator'],
                        ],
                        [['reach-in freezer'], ['reach-in freezer']],
                        [
                          ['reach-in', 'refrigerator', 'display'],
                          ['reach-in', 'refrigerator', 'display'],
                        ],
                      ];
                      let sub = matchedCat.tasks.find(
                        (s) =>
                          groundText.includes(s.name.toLowerCase()) ||
                          s.name.toLowerCase().includes(groundCat.toLowerCase())
                      );
                      if (!sub) {
                        for (const [aiKw, asanaKw] of AI_TO_ASANA_G) {
                          if (aiKw.some((kw) => groundText.includes(kw))) {
                            sub = matchedCat.tasks.find((s) =>
                              asanaKw.some(
                                (mk) =>
                                  s.name.toLowerCase().includes(mk) ||
                                  mk.includes(s.name.toLowerCase())
                              )
                            );
                            if (sub) break;
                          }
                        }
                      }
                      if (sub) setSubcategory(sub.name);
                      else if (groundSub) setSubcategory(groundSub);
                    }
                  }
                } else {
                  applyLocalTaxonomy(groundCat, groundSub);
                }
              }

              if (f.subcategory && !f.category) setSubcategory((prev) => prev || f.subcategory);

              // Grounding wins: when Gemini confirms a model match against a real
              // spec sheet, its classification supersedes OCR's. OCR often misreads
              // freezers as coolers (or vice versa) when the nameplate doesn't say
              // explicitly — the spec sheet is authoritative. Re-resolve against
              // Asana sections/tasks when available, otherwise apply directly.
              if (f.model_match_confirmed && (f.category || f.subcategory)) {
                const groundCatFinal = f.category || '';
                const groundSubFinal = f.subcategory || '';
                const groundTextFinal = `${groundCatFinal} ${groundSubFinal}`.toLowerCase();
                const cats = asanaSectionsRef.current;
                let bestCat = null;
                let bestSub = null;
                for (const c of cats) {
                  if (!c.tasks?.length) continue;
                  const s = c.tasks.find((x) => {
                    const n = (x.name || '').toLowerCase();
                    if (!n) return false;
                    return (
                      n === groundCatFinal.toLowerCase() ||
                      n === groundSubFinal.toLowerCase() ||
                      groundTextFinal.includes(n) ||
                      n.includes(groundCatFinal.toLowerCase()) ||
                      (groundSubFinal && n.includes(groundSubFinal.toLowerCase()))
                    );
                  });
                  if (s) {
                    bestCat = c;
                    bestSub = s;
                    break;
                  }
                }
                if (bestCat) {
                  setCategory(bestCat.name);
                  setSelectedCategoryItem(bestCat);
                  if (bestSub) setSubcategory(bestSub.name);
                  else if (groundSubFinal) setSubcategory(groundSubFinal);
                } else if (cats.length) {
                  // Asana mode, no section matched the confirmed class — triage.
                  applyUnidentified(groundCatFinal, groundSubFinal);
                } else {
                  applyLocalTaxonomy(groundCatFinal, groundSubFinal);
                }
              }

              if (f.manufacturer) setManufacturer((prev) => prev || f.manufacturer);
              if (f.voltage) setVoltage((prev) => prev || f.voltage);
              if (f.tonnage) setTonnage((prev) => prev || f.tonnage);
              if (f.seer) setSeer((prev) => prev || f.seer);
              if (f.eer) setEer((prev) => prev || f.eer);
              if (f.iplv) setIplv((prev) => prev || f.iplv);
              if (f.btu)
                setTonnage(
                  (prev) => prev || String(Math.round((parseFloat(f.btu) / 12000) * 10) / 10)
                );
              if (f.weight) setWeight((prev) => prev || f.weight);
              if (f.refrigerant_type) setRefrigerantType((prev) => prev || f.refrigerant_type);
              if (f.fan_count) setFanCount((prev) => prev || f.fan_count);
              if (f.evaporator_count) setEvaporatorCount((prev) => prev || f.evaporator_count);
              if (f.motor_type) setMotorType((prev) => prev || f.motor_type);
              if (f.compressor_count) setCompressorCount((prev) => prev || f.compressor_count);
              if (f.compressor_hp) setCompressorHP((prev) => prev || f.compressor_hp);
              if (f.compressor_rla) setCompressorRLA((prev) => prev || f.compressor_rla);
              if (f.compressor_lra) setCompressorLRA((prev) => prev || f.compressor_lra);
              if (f.fan_rla) setFanRLA((prev) => prev || f.fan_rla);
              if (f.fan_phases || f.fan_ph) setFanPH((prev) => prev || f.fan_phases || f.fan_ph);
              if (f.compressor_ph) setCompressorPH((prev) => prev || f.compressor_ph);
              if (f.min_circuit_ampacity) setMca((prev) => prev || f.min_circuit_ampacity);
              if (f.max_fuse_or_breaker) setMocp((prev) => prev || f.max_fuse_or_breaker);
              if (f.refrigerant_charge)
                setRefrigerantCharge((prev) => prev || f.refrigerant_charge);
              if (f.oil_type) setOilType((prev) => prev || f.oil_type);
              if (f.design_pressure_high)
                setDesignPressureHigh((prev) => prev || f.design_pressure_high);
              if (f.design_pressure_low)
                setDesignPressureLow((prev) => prev || f.design_pressure_low);
              if (f.ahri_number) setAhriNumber((prev) => prev || f.ahri_number);
              if (f.fan_fla) setFanFla((prev) => prev || f.fan_fla);
              if (f.manual_url) setManualUrl((prev) => prev || f.manual_url);
              if (groundResult.sources?.length > 0) {
                setEnrichment({ sources: groundResult.sources });
              }
            })
            .catch((err) => console.error('Grounding error (non-fatal):', err))
            .finally(() => {
              setGroundingLoading(false);
              setScanTime(((Date.now() - scanStart) / 1000).toFixed(1));
            });
        } else {
          setScanTime(((Date.now() - scanStart) / 1000).toFixed(1));
        }
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.message);
      setView('scan');
    }
  };
  handleAnalyzeRef.current = handleAnalyze;

  // --- Save (auto-creates job if needed) ---
  const handleSave = async () => {
    if (!jobNumber.trim()) {
      setError('Please enter a Job Number before saving.');
      return;
    }
    if (!jobName.trim() && !loadedJob) {
      setError('Please enter a Job Board Name or load an existing job.');
      return;
    }

    setSaving(true);
    setError(null);

    // Wait-for-full: if deep enrichment is still in flight, let it land (≤15s)
    // so the saved/synced device includes the enriched fields. No-op in the sync
    // path (ref stays null). Usually already resolved — the user reviews/adds
    // supporting photos while it runs.
    if (enrichmentPromiseRef.current) {
      await Promise.race([enrichmentPromiseRef.current, new Promise((r) => setTimeout(r, 15000))]);
    }

    try {
      let job = loadedJob;
      if (!job || !job.id) {
        let existingJob = null;
        try {
          existingJob = await getJobByNumber(jobNumber.trim());
        } catch (queryErr) {
          console.warn('[save] Job lookup query failed:', queryErr.message);
        }
        if (existingJob) {
          job = existingJob;
        } else {
          job = await createJob({
            clientName: jobName.trim(),
            jobNumber: jobNumber.trim(),
            asanaProjectGid: asanaProject?.gid || null,
          });
        }
        setLoadedJob(job);
      }

      const npLabel = nameplateLabel
        ? `${equipmentNumber} - ${nameplateLabel}`
        : `${equipmentNumber}`;
      const stampedImage = await stampLabelOnPhoto(imageBase64, npLabel);
      const blob = base64ToBlob(stampedImage);
      const imageData = await uploadScanImage(blob);

      const enrichedAnalysis = {
        ...(typeof analysis === 'object' ? analysis : {}),
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
          tonnageOverride || (originalTonnage && tonnage !== originalTonnage)
        ),
        override_reason: overrideReason || null,
        overridden_at:
          overriddenAt ||
          (originalTonnage && tonnage !== originalTonnage ? new Date().toISOString() : null),
        compressor_count: compressorCount,
        compressor_hp: compressorHP,
        compressor_rla: compressorRLA,
        compressor_lra: compressorLRA,
        compressor_ph: compressorPH,
        min_circuit_ampacity: mca,
        max_fuse_or_breaker: mocp,
        fan_rla: fanRLA,
        fan_ph: fanPH,
        fan_phases: fanPH,
        fan_count: fanCount,
        evaporator_count: evaporatorCount,
        motor_type: motorType,
        quantity,
        aoe,
        seer,
        eer,
        iplv,
        weight,
        refrigerant_type: refrigerantType,
        refrigerant_charge: refrigerantCharge,
        oil_type: oilType,
        design_pressure_high: designPressureHigh,
        design_pressure_low: designPressureLow,
        ahri_number: ahriNumber,
        fan_fla: fanFla,
        mfg_year: mfgYear,
        notes,
      };

      // Overlay deep-enriched fields (read from ref to dodge React stale-closure)
      // into any slot the live form state didn't already fill. Guarantees the
      // saved/synced device is the full record even on a save-while-enriching race.
      const enriched = latestEnrichedRef.current;
      if (enriched) {
        for (const [k, v] of Object.entries(enriched)) {
          const cur = enrichedAnalysis[k];
          if (v != null && v !== '' && (cur == null || cur === '')) {
            enrichedAnalysis[k] = v;
          }
        }
      }

      const scan = await createScan({
        image: imageData,
        provider: analysisProvider,
        model: 'gemini-2.5-flash',
        analysisResult: enrichedAnalysis,
        jobNumber: jobNumber.trim(),
        equipmentType: category || null,
        status: 'completed',
        nameplateLabel: nameplateLabel || null,
      });

      const deviceData = mapAnalysisToDevice(enrichedAnalysis);
      deviceData.name = jobName || job.clientName;
      deviceData.deviceName = deviceName || deviceData.modelNumber || 'Scanned Device';
      deviceData.category = category;
      deviceData.subcategory = subcategory;
      deviceData.subcategoryDetail = subcategoryDetail;
      deviceData.equipmentType = equipmentType;
      deviceData.notes = notes;

      const device = await createDevice(job.id, deviceData);
      await linkScanToDevice(device.id, scan.id);

      setSavedScanData({
        scan,
        device,
        job,
        imageBase64: stampedImage,
        deviceName: deviceName || deviceData.modelNumber || 'Scanned Device',
        manufacturer,
        modelNumber,
        category,
        subcategory,
      });

      setView('supporting-prompt');
    } catch (err) {
      console.error('[save] FAILED at step:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncAsana = async (job, devices) => {
    const response = await apiFetch('/api/asana/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job, devices }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Asana sync failed');
    }
    const failed = (data.results || []).filter((r) => r.action === 'error');
    if (failed.length > 0) {
      throw new Error(failed[0].error || 'Asana sync failed for one or more devices');
    }
    return data;
  };

  // --- Sync to Asana (nameplate + supporting photos) ---
  const handleSyncToAsana = async () => {
    if (!savedScanData) return;

    if (savedScanData.device?.asana?.synced) {
      const ok = window.confirm(
        'This device was already synced to Asana. Syncing again will add a duplicate comment.\n\nContinue anyway?'
      );
      if (!ok) return;
    }

    setSyncing(true);
    setError(null);
    try {
      const uploadedSupporting = [];
      for (const photo of supportingPhotos) {
        const blob = base64ToBlob(photo.base64);
        const imageData = await uploadScanImage(blob);
        uploadedSupporting.push({
          label: photo.label,
          url: imageData.url,
          path: imageData.path,
          size: imageData.size,
        });
      }

      if (savedScanData.scan) {
        const updates = {};
        if (nameplateLabel) updates.nameplateLabel = nameplateLabel;
        if (uploadedSupporting.length > 0) updates.supportingPhotos = uploadedSupporting;
        if (Object.keys(updates).length > 0) await updateScan(savedScanData.scan.id, updates);
      }

      const syncJob = {
        ...savedScanData.job,
        asana: {
          ...(savedScanData.job?.asana || {}),
          projectGid: asanaProject?.gid || savedScanData.job?.asana?.projectGid || null,
        },
      };
      if (!syncJob.asana.projectGid) {
        throw new Error('No Asana project selected. Please assign a job project before syncing.');
      }

      await handleSyncAsana(syncJob, [
        {
          ...savedScanData.device,
          scanId: savedScanData.scan?.id || null,
          equipmentNumber,
          nameplateLabel: nameplateLabel || null,
          image: savedScanData.imageBase64,
          supportingPhotos: supportingPhotos.map((p) => ({ base64: p.base64, label: p.label })),
        },
      ]);

      const nextNum = equipmentNumber + 1;
      setEquipmentNumber(nextNum);
      if (savedScanData?.job?.id) {
        updateJob(savedScanData.job.id, { nextPhotoNumber: nextNum }).catch(() => {});
      }
      setSyncDone(true);
    } catch (err) {
      console.error('Asana sync error:', err);
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  // --- Save to offline cache (skip Asana sync) ---
  const handleSaveOffline = () => {
    const nextNum = equipmentNumber + 1;
    setEquipmentNumber(nextNum);
    if (loadedJob?.id) {
      updateJob(loadedJob.id, { nextPhotoNumber: nextNum }).catch(() => {});
    }
    resetScanFields();
    setView('scan');
  };

  // --- Mark survey complete — resets photo counter to 1 ---
  const handleSurveyComplete = () => {
    setEquipmentNumber(1);
    if (boardIdRef.current) {
      localStorage.setItem(`equipNum_${boardIdRef.current}`, '1');
    }
    const jobId = savedScanData?.job?.id || loadedJob?.id;
    if (jobId) {
      updateJob(jobId, { nextPhotoNumber: 1, surveyCompletedAt: new Date() }).catch(() => {});
    }
    resetScanFields();
    setView('scan');
  };

  const _handleSync = async () => {
    setSyncProgress({ status: 'starting', total: 0, uploaded: 0, analyzed: 0, failed: 0 });
    try {
      await syncOfflineQueue((progress) => {
        setSyncProgress(progress);
      });
      await offlineQueueStore.loadQueueFromDB();
      setTimeout(() => {
        setSyncProgress(null);
        setView('scan');
      }, 1000);
    } catch (error) {
      console.error('Sync error:', error);
      setSyncProgress({ status: 'error', error: error.message });
      setTimeout(() => {
        setSyncProgress(null);
      }, 3000);
    }
  };

  const inputClass =
    'w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';
  const selectClass = `${inputClass} bg-gray-800`;
  const labelClass = 'block text-sm font-medium text-gray-400 mb-1';

  // Returns a colored confidence dot for a scan result field.
  // Green = read from nameplate; yellow = filled by web grounding.
  const fieldBadge = (fieldName, value) => {
    if (!value && value !== 0) return null;
    const wasMissing = scanMissingFields.includes(fieldName);
    if (wasMissing) {
      return (
        <span
          title="Filled by web search"
          className="inline-block w-2 h-2 rounded-full bg-yellow-400 ml-1 align-middle"
        />
      );
    }
    return (
      <span
        title="Read from nameplate"
        className="inline-block w-2 h-2 rounded-full bg-green-500 ml-1 align-middle"
      />
    );
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#0F1419] text-gray-100 flex flex-col">
      {/* Header — sticky, edge-to-edge, compact */}
      <header className="sticky top-0 z-40 bg-[#1A2332]/95 backdrop-blur-md border-b border-gray-700/50 py-2.5">
        <div className="flex items-center justify-between max-w-lg mx-auto w-full px-5">
          <button
            onClick={() => resetAll()}
            className="text-lg font-bold text-[#67986A] active:text-green-400 transition-colors"
          >
            MADISON SITE HUNTER 2.0
          </button>
          <div className="flex items-center gap-2.5">
            {/* Header Capture Mode Toggle */}
            <div className="inline-flex rounded-lg bg-[#0D1520] p-0.5 border border-gray-700">
              <button
                type="button"
                onClick={() => setCaptureMode('guided')}
                title="Guided Survey Mode (4-step asset taxonomy + blur check)"
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all flex items-center gap-1 ${
                  captureMode === 'guided'
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>⚡</span>
                <span className="hidden sm:inline">Guided</span>
              </button>
              <button
                type="button"
                onClick={() => setCaptureMode('quick')}
                title="Quick Scan Mode (single-shot nameplate)"
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all flex items-center gap-1 ${
                  captureMode === 'quick'
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>🚀</span>
                <span className="hidden sm:inline">Quick</span>
              </button>
            </div>

            {user?.photoURL && (
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="w-7 h-7 rounded-full"
                referrerPolicy="no-referrer"
              />
            )}
            <button
              onClick={async () => {
                await logOut();
                window.location.reload();
              }}
              className="text-xs text-red-400 active:text-red-300 font-medium px-2 py-1"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 py-3 pb-[env(safe-area-inset-bottom,16px)] max-w-lg mx-auto w-full scroll-native">
        {/* Error banner */}
        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-700 text-red-300 rounded-lg p-3 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 ml-2 flex-shrink-0"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <Suspense fallback={null}>
          {/* ===== SCAN VIEW (also the landing view) ===== */}
          {view === 'scan' && (
            <ScanView
              labelClass={labelClass}
              selectClass={selectClass}
              inputClass={inputClass}
              offlineQueueStore={offlineQueueStore}
              offlineModeEnabled={offlineModeEnabled}
              setOfflineModeEnabled={setOfflineModeEnabled}
              jobName={jobName}
              setJobName={setJobName}
              jobNumber={jobNumber}
              setJobNumber={setJobNumber}
              asanaProject={asanaProject}
              loadedJob={loadedJob}
              handleLoadJob={handleLoadJob}
              loadingJob={loadingJob}
              showBoardPicker={showBoardPicker}
              boardMatches={boardMatches}
              isAsanaMode={isAsanaMode}
              asanaSections={asanaSections}
              category={category}
              setCategory={setCategory}
              subcategory={subcategory}
              setSubcategory={setSubcategory}
              categoryOptions={categoryOptions}
              subcategoryOptions={subcategoryOptions}
              setSelectedCategoryItem={setSelectedCategoryItem}
              streaming={streaming}
              videoRef={videoRef}
              cameraError={cameraError}
              stopCamera={stopCamera}
              takePhoto={takePhoto}
              imageBase64={imageBase64}
              startCamera={startCamera}
              fileInputRef={fileInputRef}
              handleFileUpload={handleFileUpload}
              canvasRef={canvasRef}
              setView={setView}
              equipmentNumber={equipmentNumber}
              nameplateLabel={nameplateLabel}
              setNameplateLabel={setNameplateLabel}
              captureMode={captureMode}
              setCaptureMode={setCaptureMode}
              onGuidedCaptureComplete={handleGuidedCaptureComplete}
              exportLoading={exportLoading}
              exportStage={exportStage}
              exportError={exportError}
              exportSuccess={exportSuccess}
              showCelebration={showCelebration}
              setShowCelebration={setShowCelebration}
              setExportLoading={setExportLoading}
              setExportError={setExportError}
              setExportSuccess={setExportSuccess}
              setExportStage={setExportStage}
              exportJobName={exportJobName}
              setExportJobName={setExportJobName}
              exportJobNumber={exportJobNumber}
              setExportJobNumber={setExportJobNumber}
              handleExportSearch={handleExportSearch}
              exportBoardMatches={exportBoardMatches}
              setExportBoardMatches={setExportBoardMatches}
              exportSelectedBoard={exportSelectedBoard}
              setExportSelectedBoard={setExportSelectedBoard}
              handleExportConfirm={handleExportConfirm}
              billingPullLoading={billingPullLoading}
              billingPullMessage={billingPullMessage}
              setBillingPullMessage={setBillingPullMessage}
              handlePullBilling={handlePullBilling}
              photoSortLoading={photoSortLoading}
              photoSortMessage={photoSortMessage}
              setPhotoSortMessage={setPhotoSortMessage}
              handleSortPhotos={handleSortPhotos}
              showReadinessModal={showReadinessModal}
              setShowReadinessModal={setShowReadinessModal}
              readinessData={readinessData}
              readinessLoading={readinessLoading}
              readinessError={readinessError}
              activeJobTarget={activeJobTarget}
              handleOpenReadiness={handleOpenReadiness}
              handleSyncAsana={handleQuickExportSync}
              syncLoading={syncLoading}
              syncProgress={syncProgress}
              syncStatus={syncStatus}
              resetAll={resetAll}
              resetJobContext={resetJobContext}
            />
          )}

          {/* ===== ANALYZING ===== */}
          {view === 'analyzing' && <AnalyzingView imageBase64={imageBase64} />}

          {/* ===== RESULT (AI-populated, editable) ===== */}
          {view === 'result' && (
            <ResultView
              imageBase64={imageBase64}
              analysis={analysis}
              scanTime={scanTime}
              groundingLoading={groundingLoading}
              saving={saving}
              showRawJSON={showRawJSON}
              setShowRawJSON={setShowRawJSON}
              mfgYear={mfgYear}
              mfgYearSource={mfgYearSource}
              age={age}
              energyStar={energyStar}
              energyStarLoading={energyStarLoading}
              scanMissingFields={scanMissingFields}
              fields={{
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
              }}
              setters={{
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
              }}
              category={category}
              setCategory={setCategory}
              subcategory={subcategory}
              setSubcategory={setSubcategory}
              subcategoryDetail={subcategoryDetail}
              categoryOptions={categoryOptions}
              subcategoryOptions={subcategoryOptions}
              isAsanaMode={isAsanaMode}
              asanaSections={asanaSections}
              selectedCategoryItem={selectedCategoryItem}
              setSelectedCategoryItem={setSelectedCategoryItem}
              jobNumber={jobNumber}
              jobName={jobName}
              nameplateLabel={nameplateLabel}
              setNameplateLabel={setNameplateLabel}
              onSave={handleSave}
              onReset={handleReset}
              onLookupModel={handleModelLookup}
              lookupLoading={lookupLoading}
              lookupError={lookupError}
              onGetRecommendations={handleGetRecommendations}
              recLoading={recLoading}
              recStatus={recStatus}
              recError={recError}
              recommendations={recommendations}
              requiresReview={requiresReview}
              inputClass={inputClass}
              selectClass={selectClass}
              labelClass={labelClass}
              fieldBadge={fieldBadge}
              enrichment={enrichment}
              setEnrichment={setEnrichment}
            />
          )}

          {/* ===== SUPPORTING PHOTOS PROMPT ===== */}
          {view === 'supporting-prompt' && (
            <SupportingPromptView savedScanData={savedScanData} setView={setView} />
          )}

          {/* ===== SUPPORTING PHOTOS VIEW ===== */}
          {view === 'supporting' && (
            <SupportingView
              labelClass={labelClass}
              inputClass={inputClass}
              supportingLabel={supportingLabel}
              setSupportingLabel={setSupportingLabel}
              generatePhotoLabel={(index) => {
                const letters = 'abcdefghijklmnopqrstuvwxyz';
                if (index < 26) return `${equipmentNumber}${letters[index]}`;
                const set = Math.floor(index / 26);
                const pos = index % 26;
                return `${equipmentNumber}${letters[set - 1] || ''}${letters[pos]}`;
              }}
              supportingPhotos={supportingPhotos}
              streaming={streaming}
              videoRef={videoRef}
              handleTakeSupportingPhoto={handleTakeSupportingPhoto}
              stopCamera={stopCamera}
              startCamera={startCamera}
              supportingFileRef={supportingFileRef}
              handleAddSupportingPhoto={handleAddSupportingPhoto}
              handleRemoveSupportingPhoto={handleRemoveSupportingPhoto}
              canvasRef={canvasRef}
              setView={setView}
              equipmentNumber={equipmentNumber}
              savedScanData={savedScanData}
            />
          )}

          {/* ===== SYNC TO ASANA PROMPT ===== */}
          {view === 'sync-prompt' && (
            <SyncPromptView
              savedScanData={savedScanData}
              supportingPhotos={supportingPhotos}
              asanaProject={asanaProject}
              syncDone={syncDone}
              equipmentNumber={equipmentNumber}
              resetScanFields={resetScanFields}
              setView={setView}
              handleSurveyComplete={handleSurveyComplete}
              handleSyncToAsana={handleSyncToAsana}
              syncing={syncing}
              handleSaveOffline={handleSaveOffline}
              error={error}
            />
          )}

          {/* ===== JOB PHOTOS (unscanned, user-categorized) ===== */}
          {view === 'job-photos' && (
            <JobPhotosView
              labelClass={labelClass}
              selectClass={selectClass}
              inputClass={inputClass}
              asanaProject={asanaProject}
              jobName={jobName}
              setJobName={setJobName}
              jobNumber={jobNumber}
              setJobNumber={setJobNumber}
              handleLoadJob={handleLoadJob}
              loadingJob={loadingJob}
              showBoardPicker={showBoardPicker}
              boardMatches={boardMatches}
              isAsanaMode={isAsanaMode}
              asanaSections={asanaSections}
              jobPhotoCategory={jobPhotoCategory}
              setJobPhotoCategory={setJobPhotoCategory}
              jobPhotoSubcategory={jobPhotoSubcategory}
              setJobPhotoSubcategory={setJobPhotoSubcategory}
              jobPhotoLabel={jobPhotoLabel}
              setJobPhotoLabel={setJobPhotoLabel}
              streaming={streaming}
              videoRef={videoRef}
              handleTakeJobPhoto={handleTakeJobPhoto}
              stopCamera={stopCamera}
              startCamera={startCamera}
              jobPhotoFileRef={jobPhotoFileRef}
              handleAddJobPhoto={handleAddJobPhoto}
              jobPhotos={jobPhotos}
              setJobPhotos={setJobPhotos}
              handleRemoveJobPhoto={handleRemoveJobPhoto}
              handleSaveJobPhotos={async () => {
                await handleSaveJobPhotos();
                setView('scan');
              }}
              savingJobPhotos={savingJobPhotos}
              error={error}
              canvasRef={canvasRef}
              setView={setView}
              resetJobContext={resetJobContext}
            />
          )}

          {/* ===== JOBS ===== */}
          {view === 'jobs' && (
            <JobList onClose={() => setView('scan')} onSyncAsana={handleSyncAsana} />
          )}

          {/* ===== HISTORY ===== */}
          {view === 'history' && <ScanHistory onClose={() => setView('scan')} />}

          {/* ===== PROCESS QUEUE — review offline photos one by one ===== */}
          {view === 'process-queue' && (
            <ProcessQueueView
              offlineQueueStore={offlineQueueStore}
              processQueueIndex={processQueueIndex}
              setProcessQueueIndex={setProcessQueueIndex}
              processQueuePreview={processQueuePreview}
              setView={setView}
              setError={setError}
              handleAnalyze={handleAnalyze}
            />
          )}

          {/* ===== ANALYTICS ===== */}
          {view === 'analytics' && <AnalyticsView setView={setView} />}
        </Suspense>
      </main>
    </div>
  );
}
