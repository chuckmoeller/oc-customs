import { memo } from 'react';
function HomeView({
  setView,
  offlineModeEnabled,
  setOfflineModeEnabled,
  offlineQueueStore,
  exportJobName,
  setExportJobName,
  exportJobNumber,
  setExportJobNumber,
  exportLoading,
  exportStage,
  handleExportSearch,
  exportBoardMatches,
  setExportBoardMatches,
  exportSelectedBoard,
  setExportSelectedBoard,
  handleExportConfirm,
  exportError,
  showCelebration,
  setShowCelebration,
  exportSuccess,
}) {
  return (
    <div className="space-y-3">
      {/* Hero — New Scan CTA */}
      <div className="space-y-3">
        <div className="flex gap-2.5">
          <button
            onClick={() => setView('scan')}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-[#67986A] text-white rounded-xl px-5 py-4 font-semibold text-lg active:bg-[#5a8a5d] transition-colors active:scale-[0.98]"
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
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            New Scan
          </button>
          <button
            onClick={() => setOfflineModeEnabled(!offlineModeEnabled)}
            className={`px-3 py-4 rounded-xl font-medium text-sm transition-colors flex flex-col items-center justify-center gap-1 min-w-[72px] active:scale-[0.97] ${
              offlineModeEnabled
                ? 'bg-yellow-600/30 border border-yellow-500/50 text-yellow-300'
                : 'bg-green-600/20 border border-green-600/40 text-green-300'
            }`}
          >
            <div
              className={`w-2.5 h-2.5 rounded-full ${offlineModeEnabled ? 'bg-yellow-400' : 'bg-green-500'}`}
            ></div>
            <span className="text-[11px] leading-tight text-center">
              {offlineModeEnabled ? 'Offline' : 'Online'}
            </span>
          </button>
        </div>

        {offlineModeEnabled && (
          <p className="text-xs text-yellow-400 bg-yellow-900/20 rounded-lg px-3 py-2 text-center">
            Photos saved locally. Use "Process Photos" to upload when ready.
          </p>
        )}
      </div>

      {/* Process Photos Queue */}
      {offlineQueueStore.queuedImages.length > 0 && (
        <button
          onClick={() => setView('process-queue')}
          className="w-full bg-orange-600 active:bg-orange-700 text-white rounded-xl p-4 text-center transition-colors active:scale-[0.98]"
        >
          <div className="flex items-center justify-center gap-3">
            <svg
              className="w-7 h-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <div>
              <p className="text-xl font-bold">
                {offlineQueueStore.queuedImages.length}{' '}
                {offlineQueueStore.queuedImages.length === 1 ? 'Photo' : 'Photos'} to Process
              </p>
              <p className="text-xs text-orange-200">Tap to review and classify with AI</p>
            </div>
          </div>
        </button>
      )}

      {/* Quick Export */}
      <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <svg
            className="w-4 h-4 text-[#67986A]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Export to Excel
        </h3>

        {/* Search row */}
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Board Name</label>
            <input
              type="text"
              value={exportJobName}
              onChange={(e) => {
                setExportJobName(e.target.value);
                setExportSelectedBoard(null);
                setExportBoardMatches([]);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleExportSearch()}
              placeholder="Search..."
              className="w-full bg-[#0D1520] border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#67986A]"
            />
          </div>
          <div className="w-28">
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Job #</label>
            <input
              type="text"
              value={exportJobNumber}
              onChange={(e) => {
                setExportJobNumber(e.target.value);
                setExportSelectedBoard(null);
                setExportBoardMatches([]);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleExportSearch()}
              placeholder="Board ID"
              className="w-full bg-[#0D1520] border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#67986A]"
            />
          </div>
          <button
            onClick={handleExportSearch}
            disabled={exportLoading || (!exportJobName.trim() && !exportJobNumber.trim())}
            className="bg-gray-600 hover:bg-gray-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {exportLoading && exportStage === 'looking-up' ? '...' : 'Search'}
          </button>
        </div>

        {/* Board picker — multiple matches */}
        {exportBoardMatches.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400">Select a board:</p>
            {exportBoardMatches.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setExportSelectedBoard(b);
                  setExportBoardMatches([]);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  exportSelectedBoard?.id === b.id
                    ? 'bg-[#67986A]/20 border border-[#67986A]/50 text-gray-200'
                    : 'bg-[#0D1520] border border-gray-600 text-gray-300 hover:border-[#67986A]/50'
                }`}
              >
                <span className="font-medium">{b.name}</span>
                <span className="text-gray-500 text-xs ml-2">#{b.id}</span>
              </button>
            ))}
          </div>
        )}

        {/* Selected board confirmation + Export button */}
        {exportSelectedBoard && !exportLoading && (
          <div className="flex items-center justify-between bg-[#0D1520] rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <svg
                className="w-4 h-4 text-[#67986A] flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-gray-200 truncate">{exportSelectedBoard.name}</span>
            </div>
            <div className="flex gap-2 ml-3">
              <button
                onClick={() => handleExportConfirm(exportSelectedBoard)}
                className="bg-[#67986A] hover:bg-[#5a8a5d] text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
              >
                Export
              </button>
            </div>
          </div>
        )}

        {/* Progress indicator */}
        {exportLoading && exportStage !== 'looking-up' && (
          <div className="bg-[#0D1520] rounded-lg px-4 py-3 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-[#67986A] border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm text-gray-300">
                {exportStage === 'building' && 'Building spreadsheet & importing bills...'}
                {exportStage === 'downloading' && 'Generating Excel file...'}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-[#67986A] rounded-full transition-all duration-1000 ease-out"
                style={{ width: exportStage === 'building' ? '50%' : '85%' }}
              ></div>
            </div>
          </div>
        )}

        {exportError && <p className="text-xs text-red-400">{exportError}</p>}
      </div>

      {/* Champagne celebration banner */}
      {showCelebration && (
        <div className="relative overflow-hidden bg-gradient-to-r from-[#1a2a1a] via-[#2a3a2a] to-[#1a2a1a] border border-[#67986A]/50 rounded-xl px-4 py-4 animate-[fadeIn_0.3s_ease-out]">
          {/* Confetti particles */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-[confetti_2s_ease-out_forwards]"
                style={{
                  left: `${5 + Math.random() * 90}%`,
                  top: '-8px',
                  backgroundColor: [
                    '#FFD700',
                    '#67986A',
                    '#FF6B6B',
                    '#4ECDC4',
                    '#FFA07A',
                    '#87CEEB',
                  ][i % 6],
                  animationDelay: `${Math.random() * 0.8}s`,
                  animationDuration: `${1.5 + Math.random() * 1.5}s`,
                }}
              ></div>
            ))}
          </div>
          <div className="relative flex items-center gap-3">
            <span className="text-3xl">🍾</span>
            <div>
              <p className="text-[#67986A] font-bold text-sm">Export Complete!</p>
              <p className="text-gray-400 text-xs">{exportSuccess}</p>
            </div>
            <button
              onClick={() => setShowCelebration(false)}
              className="ml-auto text-gray-500 hover:text-gray-300 text-lg"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Navigation list — native grouped style */}
      <div className="bg-[#1A2332] rounded-xl overflow-hidden divide-y divide-gray-700/50">
        <button
          onClick={() => setView('job-photos')}
          className="w-full px-4 py-3.5 text-left active:bg-white/5 transition-colors flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <svg
                className="w-4.5 h-4.5 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span className="font-medium text-gray-200">Quick Photo to Board</span>
          </div>
          <svg
            className="w-4 h-4 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <button
          onClick={() => setView('jobs')}
          className="w-full px-4 py-3.5 text-left active:bg-white/5 transition-colors flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center">
              <svg
                className="w-4.5 h-4.5 text-purple-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <span className="font-medium text-gray-200">Jobs</span>
          </div>
          <svg
            className="w-4 h-4 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <button
          onClick={() => setView('history')}
          className="w-full px-4 py-3.5 text-left active:bg-white/5 transition-colors flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-600/20 flex items-center justify-center">
              <svg
                className="w-4.5 h-4.5 text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <span className="font-medium text-gray-200">Scan History</span>
          </div>
          <svg
            className="w-4 h-4 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
export default memo(HomeView);
