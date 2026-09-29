import { memo } from 'react';
function SupportingPromptView({ savedScanData, setView }) {
  return (
    <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-6 space-y-5">
      {/* Saved confirmation */}
      <div className="flex items-center gap-3 text-[#67986A]">
        <svg
          className="w-8 h-8"
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
        <div>
          <p className="font-semibold text-lg text-gray-100">Scan Saved</p>
          <p className="text-sm text-gray-400">
            {savedScanData?.manufacturer} {savedScanData?.modelNumber} — {savedScanData?.category}
            {savedScanData?.subcategory ? ` / ${savedScanData.subcategory}` : ''}
          </p>
        </div>
      </div>

      {/* Nameplate thumbnail */}
      {savedScanData?.imageBase64 && (
        <div className="rounded-lg overflow-hidden bg-black">
          <img
            src={savedScanData.imageBase64}
            alt="Nameplate"
            className="w-full max-h-[20vh] object-contain"
          />
        </div>
      )}

      {/* Prompt */}
      <div className="text-center space-y-3">
        <p className="text-gray-200 font-medium text-lg">Add Supporting Photos?</p>
        <p className="text-sm text-gray-400">
          Add photos of the full unit, wiring, installation, or other details associated with this
          equipment. These won't be AI-scanned but will be grouped with the nameplate scan.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={() => setView('supporting')}
            className="flex-1 max-w-[160px] bg-[#67986A] text-white rounded-lg px-6 py-3 font-medium hover:bg-[#5a8a5d] transition-colors"
          >
            Yes
          </button>
          <button
            onClick={() => setView('sync-prompt')}
            className="flex-1 max-w-[160px] bg-gray-700 border border-gray-600 text-gray-300 rounded-lg px-6 py-3 font-medium hover:bg-gray-600 transition-colors"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}
export default memo(SupportingPromptView);
