import { apiFetch } from './api.js';

// Status labels shown as job/device badges
export const STATUS_LABELS = {
  0: 'Working on it',
  1: 'Closed',
  2: 'Stuck',
  3: 'Ready for Proposal',
  4: 'Required for Blue Print',
  6: 'Complete',
  7: 'Start Here',
};

export const STATUS_COLORS = {
  'Working on it': '#fdab3d',
  Closed: '#037f4c',
  Stuck: '#df2f4a',
  'Ready for Proposal': '#007eb5',
  'Required for Blue Print': '#ff5ac4',
  Complete: '#00c875',
  'Start Here': '#216edf',
};

/**
 * Normalizes a backend Job model into the format expected by the frontend.
 */
function formatJob(raw) {
  if (!raw) return null;
  return {
    ...raw,
    id: raw.id,
    clientName: raw.client_name || raw.clientName || 'Untitled Job',
    jobNumber: raw.job_number || raw.jobNumber || null,
    clientGroup: raw.client_group || raw.clientGroup || 'Client [Company]',
    status: raw.status || 'Start Here',
    advisor: raw.advisor || null,
    date: raw.job_date || raw.date || null,
    notes: raw.notes || '',
    address: raw.address || null,
    city: raw.city || null,
    state: raw.state || null,
    buildingType: raw.building_type || raw.buildingType || null,
    deviceCount: raw.device_count ?? raw.deviceCount ?? (raw.devices ? raw.devices.length : 0),
    scanCount: raw.scan_count ?? raw.scanCount ?? 0,
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
    asana: {
      projectGid: raw.asana_project_gid || raw.asana?.projectGid || null,
      synced: raw.asana_synced ?? raw.asana?.synced ?? false,
      lastSyncedAt: raw.asana_last_synced_at || raw.asana?.lastSyncedAt || null,
    },
  };
}

/**
 * Normalizes a backend Device model into the format expected by the frontend.
 */
function formatDevice(raw) {
  if (!raw) return null;
  return {
    ...raw,
    id: raw.id,
    jobId: raw.job_id || raw.jobId,
    name: raw.name || raw.device_name || 'Equipment',
    deviceName: raw.device_name || raw.name || 'Equipment',
    category: raw.category || '',
    subcategory: raw.subcategory || '',
    subcategoryDetail: raw.subcategory_detail || raw.subcategoryDetail || '',
    equipmentType: raw.equipment_type || raw.equipmentType || '',
    manufacturer: raw.manufacturer || '',
    modelNumber: raw.model_number || raw.modelNumber || '',
    serialNumber: raw.serial_number || raw.serialNumber || '',
    voltage: raw.voltage || null,
    tonnage: raw.tonnage || '',
    compressorCount: raw.compressor_count ?? raw.compressorCount,
    compressorHP: raw.compressor_hp || raw.compressorHP || '',
    compressorHPEstimated: Boolean(raw.compressor_hp_estimated ?? raw.compressorHPEstimated),
    compressorRLA: raw.compressor_rla || raw.compressorRLA || '',
    compressorRLAEstimated: Boolean(raw.compressor_rla_estimated ?? raw.compressorRLAEstimated),
    compressorLRA: raw.compressor_lra || raw.compressorLRA || '',
    compressorPH: raw.compressor_ph || raw.compressorPH || '',
    mca: raw.mca || '',
    mocp: raw.mocp || '',
    fanCount: raw.fan_count ?? raw.fanCount,
    evaporatorCount: raw.evaporator_count ?? raw.evaporatorCount,
    fanPH: raw.fan_ph || raw.fanPH || '',
    fanRLA: raw.fan_rla || raw.fanRLA || '',
    fanFla: raw.fan_fla || raw.fanFla || '',
    fanHP: raw.fan_hp || raw.fanHP || '',
    motorType: raw.motor_type || raw.motorType || '',
    aoe: raw.aoe || '',
    quantity: raw.quantity || 1,
    mfgYear: raw.mfg_year || raw.mfgYear || null,
    refrigerantType: raw.refrigerant_type || raw.refrigerantType || '',
    refrigerantCharge: raw.refrigerant_charge || raw.refrigerantCharge || '',
    weight: raw.weight || '',
    status: raw.status || 'Start Here',
    advisor: raw.advisor || null,
    notes: raw.notes || '',
    scanIds: raw.scan_ids || raw.scanIds || [],
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
    asana: {
      projectGid: raw.asana_project_gid || raw.asana?.projectGid || null,
      taskGid: raw.asana_task_gid || raw.asana?.taskGid || null,
      synced: raw.asana_synced ?? raw.asana?.synced ?? false,
      lastSyncedAt: raw.asana_last_synced_at || raw.asana?.lastSyncedAt || null,
    },
  };
}

/**
 * Create a new job
 */
export async function createJob(jobData) {
  const payload = {
    client_name: jobData.clientName || 'New Job',
    job_number: jobData.jobNumber || null,
    client_group: jobData.clientGroup || 'Client [Company]',
    status: jobData.status || 'Start Here',
    advisor: jobData.advisor || null,
    job_date: jobData.date || null,
    notes: jobData.notes || '',
    address: jobData.address || null,
    city: jobData.city || null,
    state: jobData.state || null,
    building_type: jobData.buildingType || null,
    entity_type: jobData.entityType || null,
    utility_name: jobData.utilityName || null,
    sqft: jobData.sqft ? parseFloat(jobData.sqft) : null,
    operating_hours_per_day: jobData.operatingHoursPerDay ? parseFloat(jobData.operatingHoursPerDay) : null,
    operating_days_per_week: jobData.operatingDaysPerWeek ? parseFloat(jobData.operatingDaysPerWeek) : null,
    contact_name: jobData.contactName || null,
    contact_email: jobData.contactEmail || null,
    contact_phone: jobData.contactPhone || null,
    asana_project_gid: jobData.asanaProjectGid || jobData.asana?.projectGid || null,
  };

  const res = await apiFetch('/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to create job: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  return formatJob(data);
}

/**
 * Create a device record
 */
export async function createDevice(jobId, deviceData) {
  const payload = {
    job_id: jobId,
    name: deviceData.name || deviceData.deviceName || 'Equipment',
    device_name: deviceData.deviceName || deviceData.name || 'Equipment',
    category: deviceData.category || '',
    subcategory: deviceData.subcategory || '',
    subcategory_detail: deviceData.subcategoryDetail || '',
    equipment_type: deviceData.equipmentType || '',
    manufacturer: deviceData.manufacturer || '',
    model_number: deviceData.modelNumber || '',
    serial_number: deviceData.serialNumber || '',
    voltage: deviceData.voltage ? String(deviceData.voltage) : null,
    tonnage: deviceData.tonnage ? String(deviceData.tonnage) : null,
    btu: deviceData.btu ? String(deviceData.btu) : null,
    compressor_count: deviceData.compressorCount ? parseInt(deviceData.compressorCount) : null,
    compressor_hp: deviceData.compressorHP ? String(deviceData.compressorHP) : null,
    compressor_hp_estimated: Boolean(deviceData.compressorHPEstimated),
    compressor_rla: deviceData.compressorRLA ? String(deviceData.compressorRLA) : null,
    compressor_rla_estimated: Boolean(deviceData.compressorRLAEstimated),
    compressor_lra: deviceData.compressorLRA ? String(deviceData.compressorLRA) : null,
    compressor_ph: deviceData.compressorPH ? String(deviceData.compressorPH) : null,
    mca: deviceData.mca ? String(deviceData.mca) : null,
    mocp: deviceData.mocp ? String(deviceData.mocp) : null,
    fan_count: deviceData.fanCount ? parseInt(deviceData.fanCount) : null,
    evaporator_count: deviceData.evaporatorCount ? parseInt(deviceData.evaporatorCount) : null,
    fan_ph: deviceData.fanPH ? String(deviceData.fanPH) : null,
    fan_rla: deviceData.fanRLA ? String(deviceData.fanRLA) : null,
    fan_fla: deviceData.fanFla ? String(deviceData.fanFla) : null,
    fan_hp: deviceData.fanHP ? String(deviceData.fanHP) : null,
    motor_type: deviceData.motorType || null,
    aoe: deviceData.aoe || null,
    quantity: deviceData.quantity ? parseInt(deviceData.quantity) : 1,
    mfg_year: deviceData.mfgYear ? parseInt(deviceData.mfgYear) : null,
    refrigerant_type: deviceData.refrigerantType || null,
    refrigerant_charge: deviceData.refrigerantCharge || null,
    weight: deviceData.weight || null,
    status: deviceData.status || 'Start Here',
    advisor: deviceData.advisor || null,
    notes: deviceData.notes || '',
    asana_project_gid: deviceData.asanaProjectGid || deviceData.asana?.projectGid || null,
    asana_task_gid: deviceData.asanaTaskGid || deviceData.asana?.taskGid || null,
  };

  const res = await apiFetch('/devices', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to create device: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  return formatDevice(data);
}

/**
 * Create a device from AI scan analysis result
 * Maps the AI output fields to the device schema
 */
export function mapAnalysisToDevice(analysisResult) {
  const data = analysisResult || {};
  return {
    modelNumber: data.model_number || data.model_no || data.modelNumber || '',
    serialNumber: data.serial_number || data.serial_no || data.serialNumber || '',
    manufacturer: data.manufacturer || data.mfg || '',
    voltage: data.voltage || data.volts || data.rated_voltage || null,
    tonnage: data.tonnage || '',
    compressorCount: parseInt(data.compressor_count || data.num_compressors) || null,
    compressorHP: data.compressor_hp || data.compressorHP || '',
    compressorHPEstimated: Boolean(data.compressor_hp_estimated || data.compressorHPEstimated),
    compressorRLA: data.compressor_rla || data.compressorRLA || '',
    compressorRLAEstimated: Boolean(data.compressor_rla_estimated || data.compressorRLAEstimated),
    compressorLRA: data.compressor_lra || data.compressorLRA || '',
    compressorPH: data.compressor_ph || data.phase?.toString() || '',
    mca: data.min_circuit_ampacity || data.mca || '',
    mocp: data.max_fuse_or_breaker || data.mocp || '',
    fanRLA: data.fan_rla || data.fanRLA || '',
    fanPH: data.fan_ph || '',
    fanCount: parseInt(data.fan_count || data.num_fans) || null,
    fanFla: data.fan_fla || data.fanFla || '',
    fanHP: data.fan_hp || data.fanHP || '',
    motorType: data.motor_type || data.motorType || '',
    evaporatorCount: parseInt(data.evaporator_count || data.num_evaporators) || null,
    aoe: data.aoe || '',
    quantity: parseInt(data.quantity) || null,
    mfgYear: parseInt(data.mfg_year || data.mfgYear) || null,
    refrigerantType: data.refrigerant_type || data.refrigerantType || '',
    refrigerantCharge: data.refrigerant_charge || data.refrigerantCharge || '',
    weight: data.weight || '',
    seer: data.seer || '',
    eer: data.eer || '',
    iplv: data.iplv || data.iplv_ip || '',
    oilType: data.oil_type || data.oilType || '',
    designPressureHigh: data.design_pressure_high || data.designPressureHigh || '',
    designPressureLow: data.design_pressure_low || data.designPressureLow || '',
    ahriNumber: data.ahri_number || data.ahriNumber || '',
    category: data.type_of_use || data.category || '',
    subcategory: data.subcategory || '',
    subcategoryDetail: data.subcategory_detail || data.subcategoryDetail || '',
    equipmentType: data.equipment_type || data.equipmentType || data.type || '',
    notes: data.notes || '',
  };
}

/**
 * Link a scan to a device
 */
export async function linkScanToDevice(deviceId, scanId) {
  if (!scanId || !deviceId) return;
  try {
    await apiFetch(`/scans/${scanId}`, {
      method: 'PATCH',
      body: JSON.stringify({ device_id: deviceId }),
    });
  } catch (err) {
    console.warn('[linkScanToDevice] Notice:', err);
  }
}

/**
 * Get all jobs for the current organization
 */
export async function getUserJobs(maxResults = 50) {
  const res = await apiFetch(`/jobs?limit=${maxResults}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch jobs: ${res.status}`);
  }
  const data = await res.json();
  return (data || []).map(formatJob);
}

/**
 * Get all devices for a job
 */
export async function getJobDevices(jobId) {
  const res = await apiFetch(`/jobs/${jobId}/devices`);
  if (!res.ok) {
    throw new Error(`Failed to fetch devices: ${res.status}`);
  }
  const data = await res.json();
  return (data || []).map(formatDevice);
}

/**
 * Look up a job by job number
 */
export async function getJobByNumber(jobNum) {
  if (!jobNum) return null;
  const res = await apiFetch(`/jobs?search=${encodeURIComponent(String(jobNum))}&limit=10`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const match = data.find(
    (j) => (j.job_number || '').trim().toLowerCase() === String(jobNum).trim().toLowerCase()
  ) || data[0];

  return formatJob(match);
}

/**
 * Get a single job by ID
 */
export async function getJob(jobId) {
  const res = await apiFetch(`/jobs/${jobId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return formatJob(data);
}

/**
 * Get a single device by ID
 */
export async function getDevice(deviceId) {
  const res = await apiFetch(`/devices/${deviceId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return formatDevice(data);
}

/**
 * Update a job
 */
export async function updateJob(jobId, updates) {
  const payload = {};
  if ('clientName' in updates) payload.client_name = updates.clientName;
  if ('client_name' in updates) payload.client_name = updates.client_name;
  if ('jobNumber' in updates) payload.job_number = updates.jobNumber;
  if ('job_number' in updates) payload.job_number = updates.job_number;
  if ('status' in updates) payload.status = updates.status;
  if ('advisor' in updates) payload.advisor = updates.advisor;
  if ('notes' in updates) payload.notes = updates.notes;
  if ('date' in updates) payload.job_date = updates.date;
  if ('jobDate' in updates) payload.job_date = updates.jobDate;
  if ('asana.projectGid' in updates) payload.asana_project_gid = updates['asana.projectGid'];
  if ('asanaProjectGid' in updates) payload.asana_project_gid = updates.asanaProjectGid;

  const res = await apiFetch(`/jobs/${jobId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to update job: ${res.status} ${errorText}`);
  }
}

/**
 * Update a device
 */
export async function updateDevice(deviceId, updates) {
  const payload = {};
  if ('deviceName' in updates) payload.device_name = updates.deviceName;
  if ('name' in updates) payload.name = updates.name;
  if ('category' in updates) payload.category = updates.category;
  if ('subcategory' in updates) payload.subcategory = updates.subcategory;
  if ('status' in updates) payload.status = updates.status;
  if ('notes' in updates) payload.notes = updates.notes;
  if ('modelNumber' in updates) payload.model_number = updates.modelNumber;
  if ('serialNumber' in updates) payload.serial_number = updates.serialNumber;
  if ('manufacturer' in updates) payload.manufacturer = updates.manufacturer;
  if ('tonnage' in updates) payload.tonnage = String(updates.tonnage);
  if ('voltage' in updates) payload.voltage = String(updates.voltage);

  const res = await apiFetch(`/devices/${deviceId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to update device: ${res.status} ${errorText}`);
  }
}

/**
 * Delete a job and all its devices
 */
export async function deleteJob(jobId) {
  const res = await apiFetch(`/jobs/${jobId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete job: ${res.status}`);
  }
}

/**
 * Delete a device
 */
export async function deleteDevice(deviceId) {
  const res = await apiFetch(`/devices/${deviceId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete device: ${res.status}`);
  }
}

/**
 * Subscribe to live updates for jobs (fetches immediately and polls periodically)
 */
export function onUserJobsChange(callback, maxResults = 50) {
  let active = true;

  const fetchJobs = async () => {
    try {
      const jobs = await getUserJobs(maxResults);
      if (active) callback(jobs);
    } catch (err) {
      console.warn('[onUserJobsChange] Fetch error:', err);
    }
  };

  fetchJobs();
  const timer = setInterval(fetchJobs, 5000);

  return () => {
    active = false;
    clearInterval(timer);
  };
}

/**
 * Subscribe to live updates for devices in a job (fetches immediately and polls periodically)
 */
export function onJobDevicesChange(jobId, callback) {
  let active = true;

  const fetchDevices = async () => {
    if (!jobId) return;
    try {
      const devices = await getJobDevices(jobId);
      if (active) callback(devices);
    } catch (err) {
      console.warn('[onJobDevicesChange] Fetch error:', err);
    }
  };

  fetchDevices();
  const timer = setInterval(fetchDevices, 4000);

  return () => {
    active = false;
    clearInterval(timer);
  };
}
