import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

import { deletePendingAudit, getPendingAudits, markAuditFailed } from './services/rebateQueue.js';

precacheAndRoute(self.__WB_MANIFEST);

// Ported from the previous generateSW `workbox.runtimeCaching` config (vite.config.js).
registerRoute(
  ({ url }) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i.test(url.href),
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 })],
  })
);

registerRoute(
  ({ url }) => /\/api\/monday\/boards$/.test(url.href),
  new NetworkFirst({
    cacheName: 'monday-boards',
    plugins: [new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 })],
  })
);

// Base URL of the standalone rebate-clearinghouse FastAPI service. Set VITE_REBATE_API_BASE_URL
// once that service is deployed; empty string keeps requests same-origin, which only works if
// site-hunter's own server proxies this path through.
const REBATE_API_BASE_URL = import.meta.env.VITE_REBATE_API_BASE_URL || '';
const REBATE_ENDPOINT = `${REBATE_API_BASE_URL}/api/v1/process-rebate`;

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-rebate-audits') {
    event.waitUntil(processPendingAudits());
  }
});

async function processPendingAudits() {
  const audits = await getPendingAudits();

  for (const audit of audits) {
    const response = await fetch(REBATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audit.payload),
    });

    if (response.status === 422) {
      // Permanently malformed payload — mark it and move on so it never blocks the rest
      // of the queue or triggers infinite retries of data that can never validate.
      await markAuditFailed(audit.id);
      continue;
    }

    if (!response.ok) {
      // Anything other than success or a definitive validation rejection is treated as
      // transient (5xx, auth hiccup, etc.) — throw so SyncManager retries the whole tag
      // with exponential backoff, same as a network-down TypeError.
      throw new Error(`Rebate audit sync failed with status ${response.status}`);
    }

    await deletePendingAudit(audit.id);
  }
}
