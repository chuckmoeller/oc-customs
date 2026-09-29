import { computeSha256 } from '../utils/cryptoUtils.js';
import { uploadScanImage, base64ToBlob } from './storage.js';
import { stampLabelOnPhoto } from '../utils/imageUtils.js';
import { apiFetch } from './api.js';
import { ROOF_TAXONOMY_MAP } from '../constants/roofTaxonomy.js';

/**
 * Stages a single roof inspection photo:
 * 1. Computes deterministic local SHA-256 digest
 * 2. Stamps the tier label on the photo
 * 3. Uploads image to backend storage (/api/upload)
 *
 * @param {object} params
 * @param {string} params.imageBase64
 * @param {string} params.tierId - 'site-context' | 'roof-overview' | ...
 * @param {number} [params.photoIndex=0]
 * @param {string} [params.label]
 * @param {number} [params.sharpnessScore=0]
 * @param {object} [params.jobContext]
 * @returns {Promise<object>} Staged asset record
 */
export async function stageRoofInspectionPhoto({
  imageBase64,
  tierId,
  photoIndex = 0,
  label = '',
  sharpnessScore = 0,
  _jobContext = {},
}) {
  const timestamp = Date.now();
  const isoTimestamp = new Date().toISOString();
  const tierConfig = ROOF_TAXONOMY_MAP[tierId] || { stepNumber: 1, label: tierId };

  // 1. Compute SHA-256 hash
  const imageHash = await computeSha256(imageBase64);

  // 2. Prepare badge stamp label: e.g. "Roof 1 - Site Context", "Roof 2-2 - Roof Overview"
  const subIndexStr = photoIndex > 0 ? `-${photoIndex + 1}` : '';
  const stampTag = `Roof ${tierConfig.stepNumber}${subIndexStr} · ${tierConfig.label}`;
  const fullLabel = label || stampTag;

  let stampedBase64 = imageBase64;
  try {
    stampedBase64 = await stampLabelOnPhoto(imageBase64, fullLabel);
  } catch (err) {
    console.warn('[roof-staging] Stamping fallback to unstamped image:', err.message);
  }

  // 3. Upload to storage
  let storageUrl = null;
  let storagePath = null;
  try {
    const blob = base64ToBlob(stampedBase64);
    const filename = `roof_${tierId}_${photoIndex + 1}_${imageHash.slice(0, 8)}.jpg`;
    const uploadResult = await uploadScanImage(blob, filename);
    storageUrl = uploadResult.url;
    storagePath = uploadResult.path;
  } catch (storageErr) {
    console.warn('[roof-staging] Storage upload notice:', storageErr.message);
  }

  return {
    id: `roof-asset-${timestamp}-${Math.random().toString(36).substring(2, 7)}`,
    taxonomy: tierId,
    photo_index: photoIndex,
    label: fullLabel,
    image_hash: imageHash,
    storage_url: storageUrl,
    storage_path: storagePath,
    sharpness_score: sharpnessScore,
    timestamp: isoTimestamp,
    base64: imageBase64,
  };
}

/**
 * Bundles the full commercial roof inspection survey and dispatches
 * to the GCP Pub/Sub topic `spec-hunter-events`.
 *
 * @param {object} params
 * @param {object} params.jobContext - { jobName, jobNumber, asanaProjectGid, address, inspector }
 * @param {object} params.checklist - { buildingSqFt, roofSqFt, estimatedAge, warrantyStatus, membraneType, conditionRating, notes }
 * @param {Array<object>} params.assets - Array of staged photo records
 * @param {string} [params.recipient] - Target email (defaults to chuck@madisonenergygroup.com)
 * @returns {Promise<object>} Dispatch response from /api/events/publish
 */
export async function submitRoofInspectionSurvey({
  jobContext = {},
  checklist = {},
  assets = [],
  recipient = 'chuck@madisonenergygroup.com',
  intentConfirmation = 'ok, send it',
  guardrail = 'ok, send it',
}) {
  const timestamp = Date.now();
  const eventId = `roof-survey-${timestamp}-${Math.random().toString(36).substring(2, 8)}`;

  // Filter and sanitize assets without sending large base64 strings over Pub/Sub
  const sanitizedAssets = assets.map((a, idx) => ({
    taxonomy: a.taxonomy,
    photo_index: a.photo_index ?? idx,
    label: a.label,
    image_hash: a.image_hash || a.imageHash,
    storage_url: a.storage_url || a.storageUrl,
    storage_path: a.storage_path || a.storagePath,
    sharpness_score: a.sharpness_score ?? a.sharpnessScore ?? 0,
    timestamp: a.timestamp || new Date().toISOString(),
  }));

  const payload = {
    event_id: eventId,
    event_type: 'roof_inspection',
    action: 'roof_inspection',
    survey_type: 'commercial_roof_inspection',
    intent_confirmation: intentConfirmation || 'ok, send it',
    guardrail: guardrail || 'ok, send it',
    timestamp: new Date().toISOString(),
    recipient,
    job_context: {
      job_name: jobContext.jobName || 'Commercial Facility',
      job_number: jobContext.jobNumber || 'N/A',
      asana_project_gid: jobContext.asanaProjectGid || null,
      address: jobContext.address || '',
      inspector: jobContext.inspector || '',
    },
    checklist: {
      building_sq_ft: Number(checklist.buildingSqFt) || 0,
      roof_sq_ft: Number(checklist.roofSqFt) || 0,
      estimated_age: Number(checklist.estimatedAge) || 0,
      warranty_status: checklist.warrantyStatus || 'Unknown',
      membrane_type: checklist.membraneType || 'TPO',
      condition_rating: checklist.conditionRating || 'Fair',
      notes: checklist.notes || '',
    },
    assets: sanitizedAssets,
    metadata: {
      client_platform: 'site-hunter-pwa',
      source: 'roof-inspection-wizard',
      total_photos: sanitizedAssets.length,
      client_timestamp: timestamp,
    },
  };

  const response = await apiFetch('/api/events/publish', {
    method: 'POST',
    body: JSON.stringify({
      topic: 'spec-hunter-events',
      event: payload,
      attributes: {
        event_type: 'roof_inspection',
        action: 'roof_inspection',
        event_id: eventId,
        recipient,
      },
    }),
  });

  return {
    ...response,
    event_id: eventId,
    payload,
  };
}
