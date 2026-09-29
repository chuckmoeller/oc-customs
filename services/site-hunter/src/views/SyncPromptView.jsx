import { memo } from 'react';
function SyncPromptView({
  savedScanData,
  supportingPhotos,
  asanaProject,
  syncDone,
  equipmentNumber,
  resetScanFields,
  setView,
  handleSurveyComplete,
  handleSyncToAsana,
  syncing,
  handleSaveOffline,
  error,
}) {
  return (
    <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-6 space-y-5">
      {/* Summary */}
      <div className="space-y-3">
        <h3 className="font-semibold text-lg text-gray-100 text-center">Sync to Asana?</h3>

        {/* Photo set summary */}
        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            {savedScanData?.imageBase64 && (
              <img
                src={savedScanData.imageBase64}
                alt="Nameplate"
                className="w-16 h-16 object-cover rounded-lg border border-gray-600"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-200 truncate">
                {savedScanData?.manufacturer} {savedScanData?.modelNumber}
              </p>
              <p className="text-sm text-gray-400">
                {savedScanData?.category}
                {savedScanData?.subcategory ? ` / ${savedScanData.subcategory}` : ''}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                1 nameplate scan + {supportingPhotos.length} supporting photo
                {supportingPhotos.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Supporting photo thumbnails */}
          {supportingPhotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {supportingPhotos.map((photo, i) => (
                <div key={i} className="flex-shrink-0 relative">
                  <img
                    src={photo.base64}
                    alt={photo.label}
                    className="w-12 h-12 object-cover rounded border border-gray-600"
                  />
                  <p className="text-[10px] text-gray-400 text-center truncate w-12 mt-0.5">
                    {photo.label}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {asanaProject && (
          <p className="text-sm text-gray-400 text-center">
            Will sync to <span className="text-[#67986A] font-medium">{asanaProject.name}</span>{' '}
            project
          </p>
        )}
      </div>

      {/* Action buttons — swap to post-sync options after successful sync */}
      {syncDone ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[#67986A] justify-center">
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-medium">
              Synced! Next equipment: <strong>#{equipmentNumber}</strong>
            </span>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                resetScanFields();
                setView('scan');
              }}
              className="flex-1 max-w-[200px] bg-[#67986A] text-white rounded-lg px-6 py-3 font-medium hover:bg-[#5a8a5d] transition-colors"
            >
              Scan Next Equipment
            </button>
            <button
              onClick={handleSurveyComplete}
              className="flex-1 max-w-[200px] bg-orange-700 border border-orange-600 text-white rounded-lg px-6 py-3 font-medium hover:bg-orange-600 transition-colors"
            >
              Survey Complete
            </button>
          </div>
          <p className="text-xs text-gray-500 text-center">
            "Survey Complete" resets the photo counter to #1 for the next survey.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 justify-center">
          <button
            onClick={handleSyncToAsana}
            disabled={syncing}
            className="flex-1 max-w-[200px] bg-[#67986A] text-white rounded-lg px-6 py-3 font-medium hover:bg-[#5a8a5d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Syncing...
              </span>
            ) : (
              'Yes — Sync Now'
            )}
          </button>
          <button
            onClick={handleSaveOffline}
            className="flex-1 max-w-[200px] bg-gray-700 border border-gray-600 text-gray-300 rounded-lg px-6 py-3 font-medium hover:bg-gray-600 transition-colors"
          >
            No — Save Offline
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
export default memo(SyncPromptView);
