import { memo } from 'react';
function SupportingView({
  labelClass,
  inputClass,
  supportingLabel,
  setSupportingLabel,
  generatePhotoLabel,
  supportingPhotos,
  streaming,
  videoRef,
  handleTakeSupportingPhoto,
  stopCamera,
  startCamera,
  supportingFileRef,
  handleAddSupportingPhoto,
  handleRemoveSupportingPhoto,
  canvasRef,
  setView,
  equipmentNumber,
  savedScanData,
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-100 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-[#67986A]"
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
            Supporting Photos
          </h3>
          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-full">
            {supportingPhotos.length} photo{supportingPhotos.length !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-sm text-gray-400">
          {savedScanData?.manufacturer} {savedScanData?.modelNumber} — {savedScanData?.category}
        </p>
        <div className="mt-3 bg-blue-900/20 border border-blue-800 rounded px-2 py-1.5">
          <p className="text-xs text-blue-300">
            <strong>Numbering:</strong> Nameplate = <strong>{equipmentNumber}</strong>, Next photos
            ={' '}
            <strong>
              {equipmentNumber}a, {equipmentNumber}b, {equipmentNumber}c...
            </strong>
          </p>
        </div>
      </div>

      {/* Label input + capture buttons */}
      <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-3">
        <div>
          <label className={labelClass}>Photo Description (Optional)</label>
          <input
            type="text"
            value={supportingLabel}
            onChange={(e) => setSupportingLabel(e.target.value)}
            placeholder="e.g. Full Unit, Wiring, Disconnect, Piping..."
            className={inputClass}
          />
          <p className="text-xs text-gray-500 mt-2">
            Will be saved as:{' '}
            <strong>
              {generatePhotoLabel(supportingPhotos.length)}
              {supportingLabel.trim() && ` - ${supportingLabel}`}
            </strong>
          </p>
        </div>

        {/* Camera preview for supporting photos */}
        {streaming ? (
          <>
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full max-h-[40vh] object-contain"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleTakeSupportingPhoto}
                className="flex-1 bg-[#67986A] text-white rounded-lg px-4 py-3 font-medium hover:bg-[#5a8a5d] transition-colors"
              >
                Capture
              </button>
              <button
                onClick={stopCamera}
                className="px-4 py-3 bg-gray-800 text-gray-300 rounded-lg font-medium hover:bg-gray-600 transition-colors border border-gray-600"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={startCamera}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-4 py-3 font-medium hover:bg-gray-700 transition-colors"
            >
              <svg
                className="w-5 h-5"
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
              Take Photo
            </button>
            <button
              onClick={() => supportingFileRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-4 py-3 font-medium hover:bg-gray-700 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Load Photo
            </button>
            <input
              ref={supportingFileRef}
              type="file"
              accept="image/*,.heic,.heif,.HEIC,.HEIF"
              className="hidden"
              onChange={handleAddSupportingPhoto}
            />
          </div>
        )}
      </div>

      {/* Photo grid */}
      {supportingPhotos.length > 0 && (
        <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-300">Added Supporting Photos</h4>
          <div className="grid grid-cols-2 gap-3">
            {supportingPhotos.map((photo, i) => (
              <div
                key={i}
                className="relative bg-black rounded-lg overflow-hidden border border-gray-600 group"
              >
                <img src={photo.base64} alt={photo.label} className="w-full h-32 object-cover" />
                {/* Photo number badge */}
                <div className="absolute top-2 left-2 bg-[#67986A] text-white rounded-md px-2 py-1 font-bold text-sm shadow-lg">
                  {generatePhotoLabel(i)}
                </div>
                {/* Label overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                  <p className="text-xs text-gray-200 truncate">{photo.label}</p>
                </div>
                {/* Remove button */}
                <button
                  onClick={() => handleRemoveSupportingPhoto(i)}
                  className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Done button */}
      <div className="flex gap-3">
        <button
          onClick={() => setView('sync-prompt')}
          className="flex-1 bg-[#67986A] text-white rounded-lg px-4 py-3 font-medium hover:bg-[#5a8a5d] transition-colors"
        >
          Done — {supportingPhotos.length} Photo{supportingPhotos.length !== 1 ? 's' : ''} Added
        </button>
        <button
          onClick={() => setView('supporting-prompt')}
          className="px-4 py-3 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg font-medium hover:bg-gray-600 transition-colors"
        >
          Back
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
export default memo(SupportingView);
