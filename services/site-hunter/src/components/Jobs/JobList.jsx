import React, { useState, useEffect } from 'react';
import { onUserJobsChange, deleteJob } from '../../services/jobs.js';
import { STATUS_COLORS } from '../../services/jobs.js';
import JobDetail from './JobDetail.jsx';

/**
 * Shows all jobs for the current user with status indicators.
 */
export default function JobList({ onClose, onSyncAsana }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubscribe = onUserJobsChange((updatedJobs) => {
      setJobs(updatedJobs);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleDelete = async (jobId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this job and all its devices?')) return;
    try {
      await deleteJob(jobId);
    } catch (err) {
      console.error('Delete job error:', err);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (selectedJob) {
    return (
      <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} onSyncAsana={onSyncAsana} />
    );
  }

  const filteredJobs = jobs.filter((job) =>
    job.clientName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
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
        Loading jobs...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Jobs</h2>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
          Back
        </button>
      </div>

      <input
        type="text"
        placeholder="Search jobs by name..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />

      {jobs.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p>No jobs yet. Scan equipment to create your first job.</p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p>No jobs match "{searchQuery}"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              onClick={() => setSelectedJob(job)}
              className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:bg-gray-50 hover:border-green-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{job.clientName}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: STATUS_COLORS[job.status] || '#9ca3af' }}
                    >
                      {job.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      {job.deviceCount || 0} device{job.deviceCount !== 1 ? 's' : ''}
                    </span>
                    {job.asana?.synced && (
                      <span className="text-xs text-purple-600 font-medium">Asana ✓</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(job.createdAt)}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleDelete(job.id, e)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    title="Delete job"
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
