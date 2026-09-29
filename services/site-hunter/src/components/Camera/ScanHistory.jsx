import { useState, useEffect, useMemo } from 'react';
import { onUserScansChange, deleteScan } from '../../services/scans.js';

const HVAC_KW = [
  'rtu',
  'rooftop',
  'split',
  'chiller',
  'boiler',
  'air handler',
  'condenser',
  'cooling tower',
  'heat pump',
  'furnace',
  'vrf',
  'vrv',
  'ptac',
  'package unit',
  'mini-split',
  'fan coil',
];
const COLD_KW = [
  'cooler',
  'freezer',
  'ice machine',
  'ice maker',
  'evaporator',
  'unit cooler',
  'walk-in',
  'reach-in',
  'display case',
  'condensing unit',
  'refriger',
  'cold storage',
];

function getCatGroup(scan) {
  const t = (scan.equipmentType || '').toLowerCase();
  if (HVAC_KW.some((k) => t.includes(k))) return 'hvac';
  if (COLD_KW.some((k) => t.includes(k))) return 'cold';
  return 'other';
}

function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Chip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-[#67986A] text-white'
          : 'bg-[#1A2332] border border-gray-700 text-gray-400 active:bg-white/5'
      }`}
    >
      {label}
    </button>
  );
}

export default function ScanHistory({ onClose }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');

  useEffect(() => {
    const unsubscribe = onUserScansChange((updated) => {
      setScans(updated);
      setLoading(false);
    }, 200);
    return unsubscribe;
  }, []);

  const jobs = useMemo(() => {
    const seen = new Set();
    return scans.map((s) => s.jobNumber).filter((j) => j && !seen.has(j) && seen.add(j));
  }, [scans]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scans.filter((s) => {
      if (catFilter !== 'all' && getCatGroup(s) !== catFilter) return false;
      if (jobFilter !== 'all' && s.jobNumber !== jobFilter) return false;
      if (q) {
        const r = s.analysis?.result || {};
        const hay = [
          s.equipmentType,
          s.jobNumber,
          s.nameplateLabel,
          r.manufacturer,
          r.model_number,
          r.serial_number,
          r.refrigerant_type,
          s.notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scans, search, jobFilter, catFilter]);

  const handleDelete = async (scanId) => {
    if (!confirm('Delete this scan?')) return;
    try {
      await deleteScan(scanId);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 pt-4">
        <button onClick={onClose} className="text-gray-400 active:text-white transition-colors">
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-white font-semibold text-lg flex-1">Scan History</h2>
        {!loading && (
          <span className="text-xs text-gray-500">
            {filtered.length}
            {filtered.length !== scans.length ? ` of ${scans.length}` : ''}
          </span>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search manufacturer, model, serial, job…"
          className="w-full bg-[#1A2332] border border-gray-700 rounded-xl pl-9 pr-9 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#67986A]"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 active:text-gray-300"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Chip label="All" active={catFilter === 'all'} onClick={() => setCatFilter('all')} />
        <Chip label="HVAC" active={catFilter === 'hvac'} onClick={() => setCatFilter('hvac')} />
        <Chip label="Cold" active={catFilter === 'cold'} onClick={() => setCatFilter('cold')} />
        {jobs.slice(0, 6).map((j) => (
          <Chip
            key={j}
            label={`Job ${j}`}
            active={jobFilter === j}
            onClick={() => setJobFilter(jobFilter === j ? 'all' : j)}
          />
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          {scans.length === 0
            ? 'No scans yet. Take your first photo!'
            : 'No scans match your filters.'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((scan) => {
            const r = scan.analysis?.result || {};
            const cap = r.tonnage
              ? `${r.tonnage} ton`
              : r.btu
                ? `${Number(r.btu).toLocaleString()} BTU`
                : r.ice_production_lbs_per_day
                  ? `${r.ice_production_lbs_per_day} lbs/day`
                  : null;

            return (
              <div
                key={scan.id}
                className="bg-[#1A2332] rounded-xl border border-gray-700/50 p-3 flex items-start gap-3"
              >
                {/* Thumbnail */}
                {scan.image?.url ? (
                  <img
                    src={scan.image.url}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-6 h-6 text-gray-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
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
                  </div>
                )}

                {/* Details */}
                <div className="flex-1 min-w-0">
                  {(r.manufacturer || r.model_number) && (
                    <div className="text-sm font-medium text-gray-200 truncate">
                      {[r.manufacturer, r.model_number].filter(Boolean).join(' ')}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {scan.equipmentType || scan.nameplateLabel || 'Unknown type'}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {r.serial_number && (
                      <span className="text-xs text-gray-500 font-mono">S/N {r.serial_number}</span>
                    )}
                    {cap && <span className="text-xs text-[#67986A]">{cap}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {scan.jobNumber && (
                      <span className="text-xs text-gray-500">Job {scan.jobNumber}</span>
                    )}
                    <span className="text-xs text-gray-600">{formatDate(scan.createdAt)}</span>
                  </div>
                </div>

                {/* Synced badge + delete */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  {scan.integrations?.asana?.synced && (
                    <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full leading-tight">
                      Synced
                    </span>
                  )}
                  <button
                    onClick={() => handleDelete(scan.id)}
                    className="text-gray-600 active:text-red-400 transition-colors mt-auto"
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
