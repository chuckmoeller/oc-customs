import { memo } from 'react';
import { CATEGORIES } from '../constants/categories.js';

function JobPhotosView({
  labelClass,
  selectClass,
  inputClass,
  asanaProject,
  jobName,
  setJobName,
  jobNumber,
  setJobNumber,
  handleLoadJob,
  loadingJob,
  showBoardPicker,
  boardMatches,
  isAsanaMode,
  asanaSections,
  jobPhotoCategory,
  setJobPhotoCategory,
  jobPhotoSubcategory,
  setJobPhotoSubcategory,
  jobPhotoLabel,
  setJobPhotoLabel,
  streaming,
  videoRef,
  handleTakeJobPhoto,
  stopCamera,
  startCamera,
  jobPhotoFileRef,
  handleAddJobPhoto,
  jobPhotos,
  setJobPhotos,
  handleRemoveJobPhoto,
  handleSaveJobPhotos,
  savingJobPhotos,
  error,
  canvasRef,
  setView,
  resetJobContext,
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4">
        <div className="flex items-center justify-between">
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
            Quick Photo to Board
          </h3>
          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-full">
            {jobPhotos.length} photo{jobPhotos.length !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-sm text-gray-400 mt-1">
          {jobName || jobNumber ? `${jobName || jobNumber} — ` : ''}Send photos directly to an Asana
          project
        </p>
      </div>

      {/* Project loader (if no project loaded) */}
      {!asanaProject && (
        <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelClass}>Project Name or ID</label>
              <input
                type="text"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="Enter project name or ID"
                className={inputClass}
              />
            </div>
            <div className="w-36">
              <label className={labelClass}>Job Number</label>
              <input
                type="text"
                value={jobNumber}
                onChange={(e) => setJobNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLoadJob()}
                placeholder="Project ID"
                className={inputClass}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleLoadJob}
                disabled={loadingJob || !jobNumber.trim()}
                className="bg-[#67986A] hover:bg-[#5a8a5d] text-white rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {loadingJob ? 'Loading...' : 'Load'}
              </button>
            </div>
          </div>
          {showBoardPicker && boardMatches.length > 1 && (
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-yellow-300">
                Multiple projects found — pick one:
              </p>
              {boardMatches.map((b) => (
                <button
                  key={b.gid}
                  onClick={() => handleLoadJob(b.gid)}
                  className="w-full text-left bg-[#1A2332] border border-gray-600 rounded-lg px-3 py-2 hover:bg-green-900/20 hover:border-green-500 transition-colors"
                >
                  <span className="font-medium text-gray-100">{b.name}</span>
                  <span className="ml-2 text-xs text-gray-400">ID: {b.gid}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Asana project status */}
      {asanaProject && (
        <div className="bg-[#1A2332] rounded-xl border border-gray-700 px-4 py-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#67986A] flex items-center gap-1">
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {asanaProject.name}
            </p>
            <button onClick={resetJobContext} className="text-xs text-gray-400 hover:text-red-500">
              Change
            </button>
          </div>
        </div>
      )}

      {/* Category + Subcategory + Label + Capture */}
      <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>
              Category {isAsanaMode && <span className="text-[#67986A] text-xs">(Section)</span>}
            </label>
            <select
              value={jobPhotoCategory}
              onChange={(e) => {
                setJobPhotoCategory(e.target.value);
                setJobPhotoSubcategory('');
              }}
              className={selectClass}
            >
              <option value="">Select category...</option>
              {isAsanaMode
                ? [...new Set(asanaSections.map((c) => c.name))].map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))
                : [
                    'Outside Pictures',
                    'Roof Photos',
                    'Breaker Panel Pictures',
                    'Blue Print',
                    'Utilities Audit',
                    'Building Envelope',
                    'Mechanical Room',
                    'Ductwork',
                    'Piping',
                    'Electrical Room',
                    'Signage / Labels',
                    'Other',
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              Subcategory {isAsanaMode && <span className="text-[#67986A] text-xs">(Task)</span>}
            </label>
            <select
              value={jobPhotoSubcategory}
              onChange={(e) => setJobPhotoSubcategory(e.target.value)}
              disabled={!jobPhotoCategory}
              className={`${selectClass} disabled:bg-gray-800 disabled:text-gray-400`}
            >
              <option value="">Select task...</option>
              {isAsanaMode && jobPhotoCategory
                ? (asanaSections.find((c) => c.name === jobPhotoCategory)?.tasks || []).map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))
                : (CATEGORIES[jobPhotoCategory] || []).map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Photo Label</label>
          <input
            type="text"
            value={jobPhotoLabel}
            onChange={(e) => setJobPhotoLabel(e.target.value)}
            placeholder="e.g. North elevation, Main disconnect, Roof overview..."
            className={inputClass}
          />
        </div>

        {/* Camera preview */}
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
                onClick={handleTakeJobPhoto}
                disabled={!jobPhotoCategory}
                className="flex-1 bg-[#67986A] text-white rounded-lg px-4 py-3 font-medium hover:bg-[#5a8a5d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              disabled={!jobPhotoCategory}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-4 py-3 font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              onClick={() => jobPhotoFileRef.current?.click()}
              disabled={!jobPhotoCategory}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-4 py-3 font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              ref={jobPhotoFileRef}
              type="file"
              accept="image/*,.heic,.heif,.HEIC,.HEIF"
              className="hidden"
              onChange={handleAddJobPhoto}
            />
          </div>
        )}
        {!jobPhotoCategory && (
          <p className="text-xs text-yellow-400">Select a category before adding photos</p>
        )}
      </div>

      {/* Photo grid grouped by category */}
      {jobPhotos.length > 0 && (
        <div className="bg-[#1A2332] rounded-xl border border-gray-700 p-4 space-y-4">
          {Object.entries(
            jobPhotos.reduce((groups, photo, idx) => {
              (groups[photo.category] = groups[photo.category] || []).push({
                ...photo,
                _idx: idx,
              });
              return groups;
            }, {})
          ).map(([cat, photos]) => (
            <div key={cat}>
              <h4 className="text-sm font-medium text-[#67986A] mb-2 flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                {cat} ({photos.length})
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <div
                    key={photo._idx}
                    className="relative bg-black rounded-lg overflow-hidden border border-gray-600"
                  >
                    <img
                      src={photo.base64}
                      alt={photo.label}
                      className="w-full h-24 object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-0.5">
                      <p className="text-[10px] text-gray-200 truncate">{photo.label}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveJobPhoto(photo._idx)}
                      className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSaveJobPhotos}
          disabled={savingJobPhotos || jobPhotos.length === 0}
          className="flex-1 bg-[#67986A] text-white rounded-lg px-4 py-3 font-medium hover:bg-[#5a8a5d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savingJobPhotos ? (
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
              Saving...
            </span>
          ) : (
            `Send ${jobPhotos.length} Photo${jobPhotos.length !== 1 ? 's' : ''} to Board`
          )}
        </button>
        <button
          onClick={() => {
            setJobPhotos([]);
            setJobPhotoLabel('');
            setJobPhotoCategory('');
            setJobPhotoSubcategory('');
            setView('scan');
          }}
          className="px-4 py-3 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg font-medium hover:bg-gray-600 transition-colors"
        >
          Back
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
export default memo(JobPhotosView);
