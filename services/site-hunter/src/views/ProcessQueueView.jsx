import { memo } from 'react';
function ProcessQueueView({
  offlineQueueStore,
  processQueueIndex,
  setProcessQueueIndex,
  processQueuePreview,
  setView,
  setError,
  handleAnalyze,
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-100 text-lg">Process Saved Photos</h3>
          <button
            onClick={() => {
              setProcessQueueIndex(0);
              setView('scan');
            }}
            className="text-gray-400 hover:text-gray-200 text-sm"
          >
            Back to Home
          </button>
        </div>
        <p className="text-sm text-gray-400 mt-1">
          {offlineQueueStore.queuedImages.length}{' '}
          {offlineQueueStore.queuedImages.length === 1 ? 'photo' : 'photos'} saved locally
          {processQueueIndex > 0 &&
            ` — viewing ${processQueueIndex + 1} of ${offlineQueueStore.queuedImages.length}`}
        </p>
      </div>

      {offlineQueueStore.queuedImages.length === 0 ? (
        <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-8 text-center">
          <p className="text-gray-400 text-lg">No photos in queue</p>
          <button
            onClick={() => setView('scan')}
            className="mt-4 bg-[#67986A] text-white rounded-lg px-6 py-3 font-medium hover:bg-[#5a8a5d] transition-colors"
          >
            Back to Home
          </button>
        </div>
      ) : (
        <>
          {/* Current photo preview */}
          {offlineQueueStore.queuedImages[processQueueIndex] && (
            <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-300">
                  Photo {processQueueIndex + 1} of {offlineQueueStore.queuedImages.length}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(
                    offlineQueueStore.queuedImages[processQueueIndex].metadata?.timestamp ||
                      Date.now()
                  ).toLocaleString()}
                </span>
              </div>
              <img
                src={processQueuePreview || ''}
                alt={`Queued photo ${processQueueIndex + 1}`}
                className="w-full max-h-[400px] object-contain rounded-lg border border-gray-600"
              />
              {!processQueuePreview && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-gray-400">Loading photo...</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-3">
                {/* Analyze with AI */}
                <button
                  onClick={async () => {
                    const photo = offlineQueueStore.queuedImages[processQueueIndex];
                    const base64 = await offlineQueueStore.getImageBase64(photo.id);
                    if (!base64) {
                      setError('Could not load photo from storage');
                      return;
                    }
                    // Remove from queue then run analysis
                    offlineQueueStore.markImageSynced(photo.id);
                    handleAnalyze(base64, { forceOnline: true });
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-4 font-medium text-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                  Classify with AI
                </button>

                {/* Skip / Delete */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (processQueueIndex < offlineQueueStore.queuedImages.length - 1) {
                        setProcessQueueIndex(processQueueIndex + 1);
                      }
                    }}
                    disabled={processQueueIndex >= offlineQueueStore.queuedImages.length - 1}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg px-4 py-3 font-medium text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this photo from the queue?')) {
                        offlineQueueStore.markImageSynced(
                          offlineQueueStore.queuedImages[processQueueIndex].id
                        );
                        // Adjust index if we deleted the last item
                        if (
                          processQueueIndex >= offlineQueueStore.queuedImages.length - 1 &&
                          processQueueIndex > 0
                        ) {
                          setProcessQueueIndex(processQueueIndex - 1);
                        }
                      }
                    }}
                    className="flex-1 bg-red-900/40 hover:bg-red-800/50 text-red-400 border border-red-700 rounded-lg px-4 py-3 font-medium text-sm transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                <button
                  onClick={() => setProcessQueueIndex(Math.max(0, processQueueIndex - 1))}
                  disabled={processQueueIndex === 0}
                  className="text-sm text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <div className="flex gap-1">
                  {offlineQueueStore.queuedImages.map((_, i) => (
                    <div
                      key={i}
                      onClick={() => setProcessQueueIndex(i)}
                      className={`w-2 h-2 rounded-full cursor-pointer ${i === processQueueIndex ? 'bg-orange-400' : 'bg-gray-600'}`}
                    />
                  ))}
                </div>
                <button
                  onClick={() =>
                    setProcessQueueIndex(
                      Math.min(offlineQueueStore.queuedImages.length - 1, processQueueIndex + 1)
                    )
                  }
                  disabled={processQueueIndex >= offlineQueueStore.queuedImages.length - 1}
                  className="text-sm text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
export default memo(ProcessQueueView);
