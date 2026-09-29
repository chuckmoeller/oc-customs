import { useCallback } from 'react';

import { addPendingAudit, deletePendingAudit, markAuditFailed } from '../services/rebateQueue';

const REBATE_API_BASE_URL = import.meta.env.VITE_REBATE_API_BASE_URL || '';
const REBATE_ENDPOINT = `${REBATE_API_BASE_URL}/api/v1/process-rebate`;

/**
 * @returns {{ submitRebateAudit: (payload: import('../services/rebateQueue').NormalizedECMData) => Promise<{ queued: boolean }> }}
 */
export function useSubmitRebateAudit() {
  const submitRebateAudit = useCallback(async (payload) => {
    const id = await addPendingAudit(payload);

    const supportsBackgroundSync = 'serviceWorker' in navigator && 'SyncManager' in window;

    if (supportsBackgroundSync) {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-rebate-audits');
      return { queued: true };
    }

    // SyncManager unsupported (e.g. iOS Safari) — no way to retry later in the background,
    // so attempt an immediate fetch and resolve the queue record now rather than leaving it
    // stuck as "pending" with nothing left to ever pick it up.
    try {
      const response = await fetch(REBATE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 422) {
        await markAuditFailed(id);
      } else if (response.ok) {
        await deletePendingAudit(id);
      }
      // Any other failure: leave the record pending — there's no background retry on this
      // browser, so it stays queued for the next explicit submit/retry action.
    } catch {
      // Network error on the fallback path: leave the record pending, same reasoning.
    }

    return { queued: false };
  }, []);

  return { submitRebateAudit };
}
