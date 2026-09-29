import React, { useState, useEffect } from "react";
import { onUserJobsChange, createJob } from "../../services/jobs.js";

/**
 * Job selector — pick an existing job or create a new one before saving a scan.
 */
export default function JobSelector({ onSelect, onCancel }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newJobName, setNewJobName] = useState("");
  const [newJobNumber, setNewJobNumber] = useState("");

  useEffect(() => {
    const unsubscribe = onUserJobsChange((updatedJobs) => {
      setJobs(updatedJobs);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleCreateJob = async () => {
    if (!newJobName.trim()) return;
    setCreating(true);
    try {
      const job = await createJob({ clientName: newJobName.trim(), jobNumber: newJobNumber.trim() || null });
      onSelect(job);
    } catch (err) {
      console.error("Create job error:", err);
    } finally {
      setCreating(false);
    }
  };

  const statusColor = (status) => {
    const colors = {
      "Start Here": "bg-blue-500",
      "Working on it": "bg-yellow-500",
      "Complete": "bg-green-500",
      "Closed": "bg-emerald-700",
      "Stuck": "bg-red-500",
      "Ready for Proposal": "bg-cyan-600",
      "Required for Blue Print": "bg-pink-500",
    };
    return colors[status] || "bg-gray-400";
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-green-600" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading jobs...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Select Job</h2>
        <button
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>

      {/* Create new job */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-700">New Job</h3>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={newJobName}
            onChange={(e) => setNewJobName(e.target.value)}
            placeholder="Client / Company name"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <input
            type="text"
            value={newJobNumber}
            onChange={(e) => setNewJobNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateJob()}
            placeholder="Job # (e.g. JOB-2026-001)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={handleCreateJob}
          disabled={creating || !newJobName.trim()}
          className="w-full bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? "Creating..." : "Create Job"}
        </button>
      </div>

      {/* Existing jobs */}
      {jobs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-500 px-1">Existing Jobs</h3>
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => onSelect(job)}
              className="w-full bg-white rounded-lg border border-gray-200 p-4 text-left hover:bg-gray-50 hover:border-green-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {job.clientName}
                    {job.jobNumber && <span className="ml-2 text-sm text-gray-500">({job.jobNumber})</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${statusColor(job.status)}`} />
                    <span className="text-xs text-gray-500">{job.status}</span>
                    <span className="text-xs text-gray-400">
                      {job.deviceCount || 0} device{job.deviceCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}

      {jobs.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-4">
          No jobs yet. Create your first one above.
        </p>
      )}
    </div>
  );
}
