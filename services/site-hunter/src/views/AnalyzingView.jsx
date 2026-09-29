import { memo } from 'react';
function AnalyzingView({ imageBase64 }) {
  return (
    <div className="bg-[#1A2332] rounded-xl shadow-sm border border-gray-700 p-8 text-center space-y-4">
      {imageBase64 && (
        <img
          src={imageBase64}
          alt="Captured"
          className="w-full max-h-[30vh] object-contain rounded-lg mx-auto"
        />
      )}
      <div className="space-y-2">
        <svg className="animate-spin h-8 w-8 text-[#67986A] mx-auto" viewBox="0 0 24 24">
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
        <p className="text-gray-300 font-medium">Analyzing equipment data...</p>
        <p className="text-sm text-gray-400">AI is extracting nameplate information</p>
      </div>
    </div>
  );
}
export default memo(AnalyzingView);
