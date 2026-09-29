import { useOfflineQueue } from './offlineQueue.js';
import { uploadScanImage, base64ToBlob } from './storage.js';
import { createScan } from './scans.js';
import { apiFetch } from './api.js';

/**
 * Sync offline queue when back online
 * Uploads images and runs pending analysis
 */
export async function syncOfflineQueue(onProgress) {
  const store = useOfflineQueue.getState();

  // Don't sync if already in progress
  if (store.syncInProgress) {
    console.warn('Sync already in progress');
    return;
  }

  try {
    store.setSyncInProgress(true);
    const { images: queuedImages, analysis: queuedAnalysis } = await store.getSyncableItems();

    let uploadedCount = 0;
    let analyzedCount = 0;
    let failedCount = 0;

    onProgress?.({
      status: 'starting',
      total: queuedImages.length + queuedAnalysis.length,
      uploaded: 0,
      analyzed: 0,
      failed: 0,
    });

    // === Phase 1: Upload images ===
    for (const queuedImage of queuedImages) {
      try {
        const { base64, metadata, id } = queuedImage;

        // Convert base64 to blob and upload
        const blob = base64ToBlob(base64);
        const filename = `offline-${id}-${Date.now()}.jpg`;
        const result = await uploadScanImage(blob, filename);

        // Create Firestore scan document with all metadata
        const scanData = {
          image: result,
          status: 'uploaded',
          provider: 'offline',
          equipmentType: metadata.category,
          nameplateLabel: metadata.nameplateLabel || null,
          ...metadata,
        };

        await createScan(scanData);

        // Mark as synced
        await store.markImageSynced(id);
        uploadedCount++;

        onProgress?.({
          status: 'uploading',
          total: queuedImages.length + queuedAnalysis.length,
          uploaded: uploadedCount,
          analyzed: analyzedCount,
          failed: failedCount,
        });
      } catch (error) {
        console.error('Failed to upload image:', error);
        await store.markSyncFailed(queuedImage.id, 'image');
        failedCount++;
      }
    }

    // === Phase 2: Run queued analysis ===
    for (const queuedAnalysisItem of queuedAnalysis) {
      try {
        const { scanId, imageBase64, provider, id } = queuedAnalysisItem;

        // Call analysis API
        const endpoint = provider === 'gemini' ? '/api/gemini/analyze' : '/api/ai/analyze';

        const response = await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: imageBase64,
            scanId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Analysis failed: ${response.statusText}`);
        }

        await response.json();

        // Mark as analyzed
        await store.markAnalysisSynced(id);
        analyzedCount++;

        onProgress?.({
          status: 'analyzing',
          total: queuedImages.length + queuedAnalysis.length,
          uploaded: uploadedCount,
          analyzed: analyzedCount,
          failed: failedCount,
        });
      } catch (error) {
        console.error('Failed to analyze image:', error);
        await store.markSyncFailed(queuedAnalysisItem.id, 'analysis');
        failedCount++;
      }
    }

    onProgress?.({
      status: 'complete',
      total: queuedImages.length + queuedAnalysis.length,
      uploaded: uploadedCount,
      analyzed: analyzedCount,
      failed: failedCount,
    });

    return {
      success: failedCount === 0,
      uploaded: uploadedCount,
      analyzed: analyzedCount,
      failed: failedCount,
    };
  } catch (error) {
    console.error('Sync error:', error);
    onProgress?.({
      status: 'error',
      error: error.message,
    });
    throw error;
  } finally {
    store.setSyncInProgress(false);
  }
}

/**
 * Get retry-able failed items
 */
export async function getFailedSyncs() {
  const store = useOfflineQueue.getState();
  const { images, analysis } = await store.getSyncableItems();

  const failedImages = images.filter((img) => img.status === 'failed');
  const failedAnalysis = analysis.filter((a) => a.status === 'failed');

  return {
    failedImages,
    failedAnalysis,
    total: failedImages.length + failedAnalysis.length,
  };
}

/**
 * Retry failed syncs with exponential backoff
 */
export async function retryFailedSyncs(onProgress) {
  const maxRetries = 3;
  const store = useOfflineQueue.getState();

  try {
    store.setSyncInProgress(true);

    // Get items with retry count < maxRetries
    const { images: allImages, analysis: allAnalysis } = await store.getSyncableItems();

    const retryableImages = allImages.filter(
      (img) => img.status === 'failed' && (img.retryCount || 0) < maxRetries
    );
    const retryableAnalysis = allAnalysis.filter(
      (a) => a.status === 'failed' && (a.retryCount || 0) < maxRetries
    );

    let retryCount = 0;
    let successCount = 0;

    onProgress?.({
      status: 'retrying',
      total: retryableImages.length + retryableAnalysis.length,
      retried: 0,
      succeeded: 0,
    });

    // Retry images with exponential backoff
    for (const img of retryableImages) {
      try {
        // Wait with exponential backoff
        const delay = Math.pow(2, img.retryCount || 0) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry upload
        const { base64, metadata, id } = img;
        const blob = base64ToBlob(base64);
        const filename = `offline-retry-${id}-${Date.now()}.jpg`;
        const result = await uploadScanImage(blob, filename);

        const scanData = {
          image: result,
          status: 'uploaded',
          provider: 'offline',
          ...metadata,
        };

        await createScan(scanData);
        await store.markImageSynced(id);
        successCount++;
      } catch (error) {
        console.error('Retry failed for image:', error);
        await store.markSyncFailed(img.id, 'image');
      }

      retryCount++;
      onProgress?.({
        status: 'retrying',
        total: retryableImages.length + retryableAnalysis.length,
        retried: retryCount,
        succeeded: successCount,
      });
    }

    // Retry analysis with exponential backoff
    for (const analysis of retryableAnalysis) {
      try {
        const delay = Math.pow(2, analysis.retryCount || 0) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));

        const endpoint = analysis.provider === 'gemini' ? '/api/gemini/analyze' : '/api/ai/analyze';

        const response = await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: analysis.imageBase64,
            scanId: analysis.scanId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Analysis retry failed: ${response.statusText}`);
        }

        await store.markAnalysisSynced(analysis.id);
        successCount++;
      } catch (error) {
        console.error('Retry failed for analysis:', error);
        await store.markSyncFailed(analysis.id, 'analysis');
      }

      retryCount++;
      onProgress?.({
        status: 'retrying',
        total: retryableImages.length + retryableAnalysis.length,
        retried: retryCount,
        succeeded: successCount,
      });
    }

    onProgress?.({
      status: 'complete',
      total: retryableImages.length + retryableAnalysis.length,
      retried: retryCount,
      succeeded: successCount,
    });

    return { succeeded: successCount, failed: retryCount - successCount };
  } catch (error) {
    console.error('Retry sync error:', error);
    throw error;
  } finally {
    store.setSyncInProgress(false);
  }
}
