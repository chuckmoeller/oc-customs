const getOrchestratorUrl = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ORCHESTRATOR_URL) {
    return import.meta.env.VITE_ORCHESTRATOR_URL;
  }
  return 'http://localhost:8000';
};

/**
 * Dispatches raw computer vision extraction data to the Python Master Orchestrator.
 */
export async function dispatchToOrchestrator(siteId, rawOcrData) {
  const orchestratorUrl = getOrchestratorUrl();

  try {
    const response = await fetch(`${orchestratorUrl}/api/v1/orchestrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        site_id: siteId,
        raw_ocr_dict: rawOcrData,
      }),
    });

    if (!response.ok) {
      throw new Error(`Orchestrator rejected the payload: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to hand off to the master orchestrator:', error);
    throw error;
  }
}

/**
 * Submits normalized ASHRAE equipment data to the Google Cloud Run simulation orchestrator.
 */
export async function submitToOrchestrator({ ashrae_data, site_id = 'site_default' }) {
  const orchestratorUrl = getOrchestratorUrl();

  try {
    const response = await fetch(`${orchestratorUrl}/api/v1/orchestrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        site_id: site_id,
        raw_ocr_dict: ashrae_data,
      }),
    });

    if (!response.ok) {
      throw new Error(`Orchestrator rejected the payload: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to submit to orchestrator:', error);
    throw error;
  }
}

/**
 * Repeatedly checks job status until completion or failure.
 */
export async function pollJobStatus(jobId, onProgress, intervalMs = 2000, timeoutMs = 60000) {
  const orchestratorUrl = getOrchestratorUrl();
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const checkStatus = async () => {
      if (Date.now() - startTime > timeoutMs) {
        return reject(new Error('Job polling timed out before completion.'));
      }

      try {
        const res = await fetch(`${orchestratorUrl}/api/v1/status/${jobId}`);
        if (!res.ok) throw new Error(`Status check returned ${res.status}`);

        const data = await res.json();
        if (onProgress) onProgress(data.status);

        if (data.status === 'completed') {
          return resolve(data.result);
        } else if (data.status === 'failed') {
          return reject(new Error(data.error || 'Simulation processing failed.'));
        }

        setTimeout(checkStatus, intervalMs);
      } catch (err) {
        reject(err);
      }
    };

    checkStatus();
  });
}
