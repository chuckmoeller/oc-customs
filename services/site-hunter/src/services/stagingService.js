import { computeSha256 } from '../utils/cryptoUtils.js';
import { uploadScanImage, base64ToBlob } from './storage.js';
import { stampLabelOnPhoto } from '../utils/imageUtils.js';
import { apiFetch } from './api.js';

/**
 * Asynchronously stages a captured asset image:
 * 1. Computes deterministic local SHA-256 hash.
 * 2. Stamps taxonomy/equipment label badge.
 * 3. Uploads binary to backend storage (/api/upload).
 * 4. Dispatches telemetry payload to GCP Pub/Sub (`spec-hunter-events`).
 *
 * @param {object} params
 * @param {string} params.imageBase64 - Raw captured base64 JPEG
 * @param {string} params.taxonomy - 'overview' | 'nameplate' | 'electrical' | 'mechanical'
 * @param {string} params.equipmentNumber - e.g. "1", "2"
 * @param {string} [params.label] - e.g. "Overview", "Nameplate", "Electrical Panel"
 * @param {number} [params.sharpnessScore=0] - Evaluated Laplacian sharpness score
 * @param {object} [params.jobContext] - { jobNumber, jobName, asanaGid }
 * @param {object} [params.metadata] - Additional telemetry attributes
 * @returns {Promise<object>} Staged asset result
 */
export async function stageAssetPhoto({
  imageBase64,
  taxonomy = 'nameplate',
  equipmentNumber = '1',
  label = '',
  photoIndex = 0,
  sharpnessScore = 0,
  jobContext = {},
  metadata = {},
}) {
  const timestamp = Date.now();
  const isoTimestamp = new Date().toISOString();

  // 1. Compute SHA-256 hash of the incoming image binary
  const imageHash = await computeSha256(imageBase64);

  // 2. Prepare badge stamp label:
  // e.g. "1 - Nameplate", "1a - Overview", "1a-2 - Overview", "1b - Electrical", "1b-2 - Electrical"
  const badgeSuffix =
    taxonomy === 'overview'
      ? 'a'
      : taxonomy === 'electrical'
        ? 'b'
        : taxonomy === 'mechanical'
          ? 'c'
          : '';
  const photoSubIndex = photoIndex > 0 ? `-${photoIndex + 1}` : '';
  const photoIndexTag = `${equipmentNumber}${badgeSuffix}${photoSubIndex}`;
  const fullStampLabel = label ? `${photoIndexTag} - ${label}` : photoIndexTag;

  let stampedBase64 = imageBase64;
  try {
    stampedBase64 = await stampLabelOnPhoto(imageBase64, fullStampLabel);
  } catch (err) {
    console.warn('[staging] Failed to stamp label on photo, using unstamped:', err.message);
  }

  // 3. Upload to storage backend
  let storageUrl = null;
  let storagePath = null;
  try {
    const blob = base64ToBlob(stampedBase64);
    const filename = `${taxonomy}_${equipmentNumber}${badgeSuffix}${photoSubIndex}_${imageHash.slice(0, 8)}.jpg`;
    const uploadResult = await uploadScanImage(blob, filename);
    storageUrl = uploadResult.url;
    storagePath = uploadResult.path;
  } catch (storageErr) {
    console.warn('[staging] Storage upload deferred or unauthenticated:', storageErr.message);
  }

  // 4. Construct telemetry event payload for GCP Pub/Sub (`spec-hunter-events`)
  const eventId = `evt-${timestamp}-${imageHash.slice(0, 8)}`;
  const telemetryPayload = {
    event_id: eventId,
    event_type: 'spec_hunter_asset_captured',
    timestamp: isoTimestamp,
    taxonomy,
    equipment_number: equipmentNumber,
    photo_index: photoIndex,
    photo_label: fullStampLabel,
    image_hash: imageHash,
    sharpness_score: sharpnessScore,
    storage_url: storageUrl,
    storage_path: storagePath,
    job_context: {
      job_number: jobContext.jobNumber || null,
      job_name: jobContext.jobName || null,
      asana_project_gid: jobContext.asanaProjectGid || null,
    },
    metadata: {
      ...metadata,
      client_timestamp: timestamp,
      client_platform: 'site-hunter-pwa',
    },
  };

  // 5. Asynchronously dispatch telemetry to backend Pub/Sub endpoint
  try {
    apiFetch('/api/events/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'spec-hunter-events',
        event: telemetryPayload,
        attributes: {
          taxonomy,
          equipment_number: equipmentNumber,
          image_hash: imageHash,
        },
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          console.warn(`[staging] Telemetry published to spec-hunter-events: ${data.messageId}`);
        }
      })
      .catch((pubsubErr) => {
        console.warn('[staging] Pub/Sub telemetry dispatch notice:', pubsubErr.message);
      });
  } catch (dispatchErr) {
    console.warn('[staging] Telemetry background fetch notice:', dispatchErr.message);
  }

  return {
    success: true,
    eventId,
    imageHash,
    stampedBase64,
    storageUrl,
    storagePath,
    taxonomy,
    photoLabel: fullStampLabel,
    sharpnessScore,
    timestamp,
  };
}
