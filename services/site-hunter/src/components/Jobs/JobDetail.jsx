import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../services/api.js';
import {
  onJobDevicesChange,
  deleteDevice,
  updateJob,
  STATUS_LABELS,
  STATUS_COLORS,
} from '../../services/jobs.js';

/**
 * Shows devices in a job with their specs. Allows Asana sync.
 */
export default function JobDetail({ job, onBack, onSyncAsana }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [editingStatus, setEditingStatus] = useState(false);
  const [showBoardPicker, setShowBoardPicker] = useState(false);
  const [boardSearch, setBoardSearch] = useState('');
  const [boardResults, setBoardResults] = useState([]);
  const [searchingBoards, setSearchingBoards] = useState(false);
  const [boardSearchError, setBoardSearchError] = useState(null);
  const [boardId, setBoardId] = useState(job.asana?.projectGid || '');
  const boardSearchRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onJobDevicesChange(job.id, (updatedDevices) => {
      setDevices(updatedDevices);
      setLoading(false);
    });
    return unsubscribe;
  }, [job.id]);

  const handleStatusChange = async (newStatus) => {
    try {
      await updateJob(job.id, { status: newStatus });
      job.status = newStatus;
      setEditingStatus(false);
    } catch (err) {
      console.error('Status update error:', err);
    }
  };

  const handleSyncAsana = async (overrideBoardId) => {
    const activeBoardId = overrideBoardId || boardId;

    // If no project GID set, show search picker
    if (!activeBoardId) {
      setShowBoardPicker(true);
      setBoardSearch('');
      setBoardResults([]);
      setBoardSearchError(null);
      // Focus search input on next tick
      setTimeout(() => boardSearchRef.current?.focus(), 50);
      return;
    }

    setSyncing(true);
    setSyncResult(null);
    try {
      if (!job.asana?.projectGid) {
        await updateJob(job.id, { 'asana.projectGid': activeBoardId });
      }
      const result = await onSyncAsana(
        { ...job, asana: { ...job.asana, projectGid: activeBoardId } },
        devices
      );
      setSyncResult({ success: true, message: result.message || 'Synced to Asana!' });
    } catch (err) {
      setSyncResult({ success: false, message: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleBoardSearch = async () => {
    const q = boardSearch.trim();
    if (!q) return;
    setSearchingBoards(true);
    setBoardResults([]);
    setBoardSearchError(null);
    try {
      const res = await apiFetch(`/api/asana/lookup?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setBoardSearchError(data.error || 'No projects found');
      } else {
        setBoardResults(data.projects || []);
        if ((data.projects || []).length === 0) {
          setBoardSearchError(`No projects matching "${q}"`);
        }
      }
    } catch {
      setBoardSearchError('Network error — check your connection');
    } finally {
      setSearchingBoards(false);
    }
  };

  const handleBoardSelect = (selectedBoardId) => {
    setBoardId(selectedBoardId);
    setShowBoardPicker(false);
    handleSyncAsana(selectedBoardId);
  };

  const handleDeleteDevice = async (deviceId) => {
    if (!confirm('Delete this device?')) return;
    try {
      await deleteDevice(deviceId);
    } catch (err) {
      console.error('Delete device error:', err);
    }
  };

  const specFields = [
    { key: 'modelNumber', label: 'Model #' },
    { key: 'serialNumber', label: 'Serial #' },
    { key: 'manufacturer', label: 'Manufacturer' },
    { key: 'voltage', label: 'Voltage' },
    { key: 'tonnage', label: 'Tonnage' },
    { key: 'compressorRLA', label: 'Comp RLA' },
    { key: 'compressorPH', label: 'Comp PH' },
    { key: 'fanRLA', label: 'Fan RLA' },
    { key: 'fanPH', label: 'Fan PH' },
    { key: 'fanCount', label: '# Fans' },
    { key: 'evaporatorCount', label: '# Evap' },
    { key: 'aoe', label: 'AoE' },
    { key: 'category', label: 'Category' },
    { key: 'subcategory', label: 'Subcategory' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Jobs
        </button>
        <button
          onClick={() => handleSyncAsana()}
          disabled={syncing || devices.length === 0}
          className="inline-flex items-center gap-2 bg-purple-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncing ? (
            <>
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
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
              Sync to Asana
            </>
          )}
        </button>
      </div>

      {/* Board search picker */}
      {showBoardPicker && (
        <div className="bg-white rounded-xl border border-purple-200 p-4 space-y-3">
          <h3 className="font-medium text-gray-900">Find Asana Project</h3>

          {/* Search input */}
          <div className="flex gap-2">
            <input
              ref={boardSearchRef}
              type="text"
              value={boardSearch}
              onChange={(e) => setBoardSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBoardSearch()}
              placeholder="Project name or ID…"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <button
              onClick={handleBoardSearch}
              disabled={searchingBoards || !boardSearch.trim()}
              className="bg-purple-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searchingBoards ? (
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
              ) : (
                'Search'
              )}
            </button>
          </div>

          {/* Results */}
          {boardSearchError && <p className="text-sm text-red-500">{boardSearchError}</p>}
          {boardResults.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {boardResults.map((board) => (
                <button
                  key={board.gid}
                  onClick={() => handleBoardSelect(board.gid)}
                  className="w-full text-left bg-gray-50 hover:bg-purple-50 hover:border-purple-300 border border-gray-200 rounded-lg p-3 transition-colors"
                >
                  <p className="font-medium text-gray-900">{board.name}</p>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowBoardPicker(false)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Sync result banner */}
      {syncResult && (
        <div
          className={`rounded-lg p-3 text-sm ${syncResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
        >
          {syncResult.message}
        </div>
      )}

      {/* Job info card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-xl font-bold text-gray-900">{job.clientName}</h2>
        <div className="flex items-center gap-3 mt-2">
          {/* Status dropdown */}
          {editingStatus ? (
            <select
              value={job.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              onBlur={() => setEditingStatus(false)}
              autoFocus
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {Object.values(STATUS_LABELS).map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => setEditingStatus(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full text-white cursor-pointer hover:opacity-80"
              style={{ backgroundColor: STATUS_COLORS[job.status] || '#9ca3af' }}
            >
              {job.status}
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
          <span className="text-sm text-gray-500">
            {devices.length} device{devices.length !== 1 ? 's' : ''}
          </span>
          {job.asana?.synced && (
            <span className="text-xs text-purple-600 font-medium">Asana synced ✓</span>
          )}
        </div>
      </div>

      {/* Devices */}
      {loading ? (
        <div className="text-center py-6 text-gray-500">
          <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-green-600" viewBox="0 0 24 24">
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
          Loading devices...
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p>No devices in this job yet.</p>
          <p className="text-sm mt-1">Scan equipment to add devices.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <div
              key={device.id}
              className="bg-white rounded-lg border border-gray-200 p-4 space-y-3"
            >
              {/* Device header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">
                    {device.deviceName || device.name || 'Unknown Device'}
                  </p>
                  {device.manufacturer && (
                    <p className="text-sm text-gray-500">{device.manufacturer}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteDevice(device.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>

              {/* Specs grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {specFields.map(({ key, label }) => {
                  const val = device[key];
                  if (!val && val !== 0) return null;
                  return (
                    <div key={key} className="bg-gray-50 rounded px-2 py-1.5">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="text-sm font-medium text-gray-800 truncate">{val}</p>
                    </div>
                  );
                })}
              </div>

              {/* Asana sync status */}
              {device.asana?.synced && (
                <div className="text-xs text-purple-500 flex items-center gap-1">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Synced to Asana
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
