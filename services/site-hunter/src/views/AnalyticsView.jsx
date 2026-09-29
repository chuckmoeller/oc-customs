import { memo, useState, useEffect } from 'react';
import { getUserScans } from '../services/scans.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function AnalyticsView({ setView }) {
  const [scans, setScans] = useState(null);

  useEffect(() => {
    getUserScans(500)
      .then(setScans)
      .catch(() => setScans([]));
  }, []);

  const loading = scans === null;
  const total = scans?.length ?? 0;

  const now = Date.now();
  const thisWeek =
    scans?.filter((s) => {
      const t = s.createdAt?.toDate?.()?.getTime() ?? new Date(s.createdAt).getTime();
      return now - t < WEEK_MS;
    }).length ?? 0;
  const synced = scans?.filter((s) => s.integrations?.asana?.synced).length ?? 0;

  // Equipment type breakdown
  const typeCounts = {};
  scans?.forEach((s) => {
    const key = s.equipmentType || 'Unknown';
    typeCounts[key] = (typeCounts[key] || 0) + 1;
  });
  const typeList = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxTypeCount = typeList[0]?.[1] || 1;

  // Weekly activity — last 8 weeks
  const weekBuckets = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * WEEK_MS;
    const start = end - WEEK_MS;
    const count =
      scans?.filter((s) => {
        const t = s.createdAt?.toDate?.()?.getTime() ?? new Date(s.createdAt).getTime();
        return t >= start && t < end;
      }).length ?? 0;
    return count;
  });
  const maxWeek = Math.max(...weekBuckets, 1);

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={() => setView('scan')}
          className="text-gray-400 active:text-white transition-colors"
        >
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
        <h2 className="text-white font-semibold text-lg">Analytics</h2>
      </div>

      {loading ? (
        <div className="text-gray-400 text-center py-12 text-sm">Loading…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#1A2332] rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-white">{total}</div>
              <div className="text-xs text-gray-400 mt-1">Total Scans</div>
            </div>
            <div className="bg-[#1A2332] rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-400">{thisWeek}</div>
              <div className="text-xs text-gray-400 mt-1">This Week</div>
            </div>
            <div className="bg-[#1A2332] rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-blue-400">{synced}</div>
              <div className="text-xs text-gray-400 mt-1">Synced</div>
            </div>
          </div>

          {/* Weekly activity bar chart */}
          <div className="bg-[#1A2332] rounded-xl p-4">
            <div className="text-sm font-medium text-gray-300 mb-3">
              Weekly Activity (last 8 weeks)
            </div>
            <div className="flex items-end gap-1.5 h-20">
              {weekBuckets.map((count, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-[#67986A]/80 rounded-sm"
                    style={{ height: `${Math.max((count / maxWeek) * 64, count > 0 ? 4 : 0)}px` }}
                  />
                  <div className="text-[9px] text-gray-500 h-3">{count > 0 ? count : ''}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Equipment type breakdown */}
          {typeList.length > 0 && (
            <div className="bg-[#1A2332] rounded-xl p-4">
              <div className="text-sm font-medium text-gray-300 mb-3">Equipment by Type</div>
              <div className="flex flex-col gap-2">
                {typeList.map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className="text-xs text-gray-400 w-32 truncate shrink-0">{type}</div>
                    <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-[#67986A] rounded-full transition-all"
                        style={{ width: `${(count / maxTypeCount) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 w-6 text-right shrink-0">{count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {total === 0 && (
            <div className="text-gray-500 text-center py-4 text-sm">
              No scans yet. Start scanning to see your analytics.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default memo(AnalyticsView);
