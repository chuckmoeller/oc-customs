import { apiFetch } from './api.js';

/**
 * Normalizes a backend Scan model into the format expected by frontend components.
 */
function formatScan(raw) {
  if (!raw) return null;
  const imageUrl = raw.image_url || raw.image?.url || raw.url || null;
  const analysisResult = raw.analysis_result || raw.analysis?.result || null;

  return {
    ...raw,
    id: raw.id,
    deviceId: raw.device_id || raw.deviceId || null,
    jobNumber: raw.job_number || raw.jobNumber || null,
    equipmentType: raw.equipment_type || raw.equipmentType || null,
    nameplateLabel: raw.nameplate_label || raw.nameplateLabel || null,
    image: {
      url: imageUrl,
      path: raw.image_path || raw.image?.path || imageUrl,
      bucket: raw.image_bucket || raw.image?.bucket || 'local-disk',
      size: raw.image_size || raw.image?.size || null,
    },
    analysis: {
      provider: raw.analysis_provider || raw.analysis?.provider || 'Claude/Gemini',
      model: raw.analysis_model || raw.analysis?.model || null,
      result: analysisResult,
      confidence: raw.analysis_confidence || raw.analysis?.confidence || null,
      analyzedAt: raw.analysis_at || raw.analysis?.analyzedAt || null,
    },
    integrations: {
      asana: {
        synced: raw.asana_synced ?? raw.integrations?.asana?.synced ?? false,
      },
    },
    status: raw.status || 'pending',
    tags: raw.tags || [],
    notes: raw.notes || '',
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
  };
}

/**
 * Create a new scan record in PostgreSQL
 * @param {object} scanData - Scan metadata
 * @returns {Promise<object>} The created scan with ID
 */
export async function createScan(scanData) {
  const imageUrl = scanData.image?.url || scanData.imageUrl || null;
  const payload = {
    device_id: scanData.deviceId || null,
    image_url: imageUrl,
    image_path: scanData.image?.path || imageUrl,
    image_bucket: scanData.image?.bucket || 'local-disk',
    image_size: scanData.image?.size || null,
    nameplate_label: scanData.nameplateLabel || null,
    analysis_provider: scanData.provider || scanData.analysis?.provider || null,
    analysis_model: scanData.model || scanData.analysis?.model || null,
    analysis_result: scanData.analysisResult || scanData.analysis?.result || null,
    analysis_confidence:
      scanData.confidence || scanData.analysis?.confidence
        ? parseFloat(scanData.confidence || scanData.analysis?.confidence)
        : null,
    job_number: scanData.jobNumber || null,
    equipment_type: scanData.equipmentType || null,
    location: scanData.location || null,
    status: scanData.status || 'pending',
    tags: scanData.tags || [],
    notes: scanData.notes || '',
  };

  const res = await apiFetch('/scans', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to create scan: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  return formatScan(data);
}

/**
 * Update an existing scan
 * @param {string} scanId - UUID
 * @param {object} updates - Fields to update
 */
export async function updateScan(scanId, updates) {
  const payload = {};
  if ('status' in updates) payload.status = updates.status;
  if ('notes' in updates) payload.notes = updates.notes;
  if ('nameplateLabel' in updates) payload.nameplate_label = updates.nameplateLabel;
  if ('deviceId' in updates) payload.device_id = updates.deviceId;
  if ('device_id' in updates) payload.device_id = updates.device_id;
  if ('jobNumber' in updates) payload.job_number = updates.jobNumber;
  if ('tags' in updates) payload.tags = updates.tags;

  const res = await apiFetch(`/scans/${scanId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to update scan: ${res.status} ${errorText}`);
  }
}

/**
 * Delete a scan
 * @param {string} scanId - UUID
 */
export async function deleteScan(scanId) {
  const res = await apiFetch(`/scans/${scanId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete scan: ${res.status}`);
  }
}

/**
 * Get a single scan by ID
 * @param {string} scanId - UUID
 * @returns {Promise<object|null>}
 */
export async function getScan(scanId) {
  const res = await apiFetch(`/scans/${scanId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return formatScan(data);
}

/**
 * Get all scans for current organization
 * @param {number} [maxResults=50] - Maximum number of results
 * @returns {Promise<Array>} List of scans
 */
export async function getUserScans(maxResults = 50) {
  const res = await apiFetch(`/scans?limit=${maxResults}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch scans: ${res.status}`);
  }
  const data = await res.json();
  return (data || []).map(formatScan);
}

/**
 * Subscribe to real-time updates for scans (fetches immediately and polls periodically)
 * @param {function} callback - receives array of scans on each update
 * @param {number} [maxResults=50] - Maximum number of results
 * @returns {function} unsubscribe function
 */
export function onUserScansChange(callback, maxResults = 50) {
  let active = true;

  const fetchScans = async () => {
    try {
      const scans = await getUserScans(maxResults);
      if (active) callback(scans);
    } catch (err) {
      console.warn('[onUserScansChange] Fetch error:', err);
    }
  };

  fetchScans();
  const timer = setInterval(fetchScans, 5000);

  return () => {
    active = false;
    clearInterval(timer);
  };
}
