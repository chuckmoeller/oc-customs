import { useState } from 'react';

export default function ExportReadinessModal({
  isOpen,
  onClose,
  readinessData,
  loading,
  error,
  onDownloadExcel,
  onDownloadCsv,
  onStartSync,
  syncLoading,
  syncProgress,
  syncStatus,
  onSortPhotos,
  photoSortLoading,
  onPullBills,
  billingPullLoading,
}) {
  const [activeTab, setActiveTab] = useState('equipment'); // 'equipment' | 'billing' | 'issues'
  const [expandedSection, setExpandedSection] = useState(null);

  if (!isOpen) return null;

  const summary = readinessData?.summary || {};
  const sections = readinessData?.sections || [];
  const billingAccounts = readinessData?.billing?.accounts || [];
  const blockers = readinessData?.blockers || [];
  const warnings = readinessData?.warnings || [];
  const status = readinessData?.status || 'ready';

  const isBlocked = status === 'blocked';
  const hasWarnings = status === 'warnings';

  const toggleSection = (id) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0D1520] border border-gray-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-gray-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700/60 flex items-center justify-between bg-[#121B28]">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-white tracking-tight">
                Export Readiness Preview
              </h3>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                  isBlocked
                    ? 'bg-red-950/70 border-red-700 text-red-300'
                    : hasWarnings
                      ? 'bg-amber-950/70 border-amber-700 text-amber-300'
                      : 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                }`}
              >
                {isBlocked ? 'Blocked' : hasWarnings ? 'Needs Review' : 'Ready to Export'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">
              {readinessData?.jobName || 'Submission Form 8'}
              {readinessData?.asanaProjectGid && (
                <span className="text-gray-500 ml-1.5 font-mono">
                  (Asana GID: {readinessData.asanaProjectGid})
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Sync in-progress banner */}
        {syncLoading && (
          <div className="bg-emerald-950/40 border-b border-emerald-800/60 px-5 py-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-emerald-300 font-medium">
                <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span>{syncStatus || 'Synchronizing project with Calibrator...'}</span>
              </div>
              {syncProgress?.total > 0 && (
                <span className="text-emerald-400 font-mono">
                  {syncProgress.current} / {syncProgress.total}
                </span>
              )}
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
                style={{
                  width:
                    syncProgress?.total > 0
                      ? `${Math.round((syncProgress.current / syncProgress.total) * 100)}%`
                      : '60%',
                }}
              />
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-400">
              <div className="w-8 h-8 border-2 border-[#67986A] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">Auditing job readiness...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-950/40 border border-red-800 rounded-xl text-red-200 text-sm">
              <div className="font-semibold text-red-300 mb-1">Audit Failed</div>
              <div>{error}</div>
            </div>
          ) : (
            <>
              {/* Metric Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#141F2E] border border-gray-700/60 rounded-xl p-3">
                  <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                    Equipment
                  </div>
                  <div className="text-xl font-bold text-white mt-1">
                    {summary.completeDevices || 0}
                    <span className="text-xs text-gray-400 font-normal">
                      {' '}
                      / {summary.totalDevices || 0}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {summary.sparseDevices > 0 ? (
                      <span className="text-amber-400 font-medium">
                        {summary.sparseDevices} sparse spec(s)
                      </span>
                    ) : (
                      <span className="text-emerald-400">100% specs complete</span>
                    )}
                  </div>
                </div>

                <div className="bg-[#141F2E] border border-gray-700/60 rounded-xl p-3">
                  <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                    Utility Energy
                  </div>
                  <div className="text-xl font-bold text-white mt-1">
                    {summary.totalBillingMonths || 0}
                    <span className="text-xs text-gray-400 font-normal"> / 12 mos</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                    {billingAccounts[0]?.matchedUtility ? (
                      <span className="text-emerald-400 truncate">
                        {billingAccounts[0].matchedUtility}
                      </span>
                    ) : billingAccounts[0]?.utilityName ? (
                      <span className="text-amber-400 truncate">
                        {billingAccounts[0].utilityName}
                      </span>
                    ) : (
                      <span className="text-gray-400">No bills loaded</span>
                    )}
                  </div>
                </div>

                <div className="bg-[#141F2E] border border-gray-700/60 rounded-xl p-3">
                  <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                    Form Fit
                  </div>
                  <div className="text-xl font-bold text-white mt-1">
                    {sections
                      .filter((s) => s.id !== 'otherEquipment')
                      .reduce((sum, s) => sum + s.deviceCount, 0)}
                    <span className="text-xs text-gray-400 font-normal"> standard</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {sections.find((s) => s.id === 'otherEquipment')?.deviceCount > 0 ? (
                      <span className="text-blue-400">
                        +{sections.find((s) => s.id === 'otherEquipment').deviceCount} on Other tab
                      </span>
                    ) : (
                      <span className="text-gray-400">Standard sections only</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-700/70 text-sm font-medium gap-6">
                <button
                  onClick={() => setActiveTab('equipment')}
                  className={`pb-2 transition-colors relative ${
                    activeTab === 'equipment'
                      ? 'text-[#67986A] font-semibold'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Template Sections ({sections.length})
                  {activeTab === 'equipment' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#67986A] rounded-full" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('billing')}
                  className={`pb-2 transition-colors relative ${
                    activeTab === 'billing'
                      ? 'text-[#67986A] font-semibold'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Utility & Energy ({billingAccounts.length} acct)
                  {activeTab === 'billing' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#67986A] rounded-full" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('issues')}
                  className={`pb-2 transition-colors relative ${
                    activeTab === 'issues'
                      ? 'text-[#67986A] font-semibold'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Audit Notes ({blockers.length + warnings.length})
                  {activeTab === 'issues' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#67986A] rounded-full" />
                  )}
                </button>
              </div>

              {/* Tab 1: Equipment Sections */}
              {activeTab === 'equipment' && (
                <div className="space-y-3">
                  {sections.map((sec) => (
                    <div
                      key={sec.id}
                      className="bg-[#141F2E] border border-gray-700/60 rounded-xl overflow-hidden transition-colors"
                    >
                      <button
                        onClick={() => toggleSection(sec.id)}
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-white text-sm">
                            {sec.displayName}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-300 rounded-md border border-gray-700">
                            {sec.deviceCount} unit{sec.deviceCount === 1 ? '' : 's'}
                          </span>
                          {sec.overflowRows > 0 && (
                            <span className="text-xs text-blue-400 font-medium">
                              +{sec.overflowRows} overflow row{sec.overflowRows === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span>Cap: {sec.cap >= 999 ? 'No limit' : sec.cap}</span>
                          <svg
                            className={`w-4 h-4 transform transition-transform ${
                              expandedSection === sec.id ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                      </button>

                      {expandedSection === sec.id && (
                        <div className="border-t border-gray-700/60 bg-[#0E1724] p-3 space-y-2">
                          {sec.devices.map((d, i) => (
                            <div
                              key={d.id || i}
                              className="p-2.5 bg-[#162232] rounded-lg border border-gray-700/40 flex items-start justify-between text-xs"
                            >
                              <div className="space-y-1">
                                <div className="font-medium text-white flex items-center gap-2">
                                  <span>{d.name}</span>
                                  {d.manufacturer && (
                                    <span className="text-gray-400 font-normal">
                                      ({d.manufacturer})
                                    </span>
                                  )}
                                </div>
                                <div className="text-gray-300 font-mono text-[11px] flex items-center gap-3">
                                  <span>Model: {d.modelNumber || '—'}</span>
                                  <span>Tons: {d.tonnage || '—'}</span>
                                  <span>Volts: {d.voltage || '—'}</span>
                                  {d.mca && <span>MCA: {d.mca}</span>}
                                  {d.compressorRLA && <span>RLA: {d.compressorRLA}</span>}
                                </div>
                              </div>

                              <div>
                                {d.isComplete ? (
                                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                    Ready
                                  </span>
                                ) : (
                                  <div className="text-right">
                                    <span className="text-amber-400 font-semibold block">
                                      Missing:
                                    </span>
                                    <span className="text-amber-300/90 text-[11px]">
                                      {d.missingFields?.join(', ')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 2: Billing & Energy */}
              {activeTab === 'billing' && (
                <div className="space-y-4">
                  {billingAccounts.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm bg-[#141F2E] border border-gray-700/60 rounded-xl p-6">
                      <p>No power bill data found for this project.</p>
                      <p className="text-xs text-gray-500 mt-1">
                        If bills are uploaded as PDF attachments in Asana, click "Pull Bills" or
                        "Sync from Asana".
                      </p>
                    </div>
                  ) : (
                    billingAccounts.map((acct, idx) => (
                      <div
                        key={acct.accountNumber || idx}
                        className="bg-[#141F2E] border border-gray-700/60 rounded-xl p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-gray-700/50 pb-2">
                          <div>
                            <span className="font-semibold text-white text-sm">
                              Account: {acct.accountNumber}
                            </span>
                            <div className="text-xs text-gray-400 mt-0.5">
                              Provider: {acct.matchedUtility || acct.utilityName || 'Unknown'}
                              {acct.matchedState && (
                                <span className="text-gray-500 ml-1">({acct.matchedState})</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                acct.isComplete
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}
                            >
                              {acct.monthsCount} / 12 Months
                            </span>
                          </div>
                        </div>

                        {/* Month Grid */}
                        <div>
                          <div className="text-xs text-gray-400 font-medium mb-1.5">
                            Captured Months:
                          </div>
                          <div className="grid grid-cols-6 gap-1.5 text-xs text-center font-mono">
                            {[
                              'January',
                              'February',
                              'March',
                              'April',
                              'May',
                              'June',
                              'July',
                              'August',
                              'September',
                              'October',
                              'November',
                              'December',
                            ].map((m) => {
                              const has = !acct.missingMonths?.includes(m);
                              return (
                                <div
                                  key={m}
                                  className={`py-1 rounded border text-[11px] ${
                                    has
                                      ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300'
                                      : 'bg-gray-800/40 border-gray-700/40 text-gray-500 line-through'
                                  }`}
                                  title={has ? `${m} captured` : `${m} missing`}
                                >
                                  {m.substring(0, 3)}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-gray-700/50">
                          <div>
                            <span className="text-gray-400">Total Annual Usage:</span>
                            <span className="text-white font-semibold ml-2">
                              {acct.annualKwh?.toLocaleString() || 0} kWh
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">Blended Rate:</span>
                            <span className="text-white font-semibold ml-2">
                              ${acct.blendedRate?.toFixed(4) || 0} / kWh
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {onPullBills && (
                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={onPullBills}
                        disabled={billingPullLoading}
                        className="flex items-center gap-1.5 border border-gray-600 text-gray-300 hover:border-[#67986A]/50 disabled:opacity-50 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap"
                      >
                        {billingPullLoading && (
                          <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        )}
                        {billingPullLoading ? 'Pulling Bills…' : 'Pull Bills from Asana'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Issues & Warnings */}
              {activeTab === 'issues' && (
                <div className="space-y-2.5">
                  {blockers.length === 0 && warnings.length === 0 && (
                    <div className="text-center py-8 text-emerald-400 text-sm font-medium bg-[#141F2E] border border-gray-700/60 rounded-xl p-6">
                      ✓ No blockers or warnings found! All equipment and billing data meet
                      Submission Form 8 criteria.
                    </div>
                  )}

                  {blockers.map((b, i) => (
                    <div
                      key={i}
                      className="p-3 bg-red-950/40 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-start gap-2.5"
                    >
                      <svg
                        className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <div>
                        <div className="font-semibold text-red-300">{b.code}</div>
                        <div>{b.message}</div>
                      </div>
                    </div>
                  ))}

                  {warnings.map((w, i) => (
                    <div
                      key={i}
                      className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-xl text-amber-200 text-xs flex items-start gap-2.5"
                    >
                      <svg
                        className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <div>
                        <div className="font-semibold text-amber-300">{w.code}</div>
                        <div>{w.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-gray-700/60 bg-[#121B28] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onStartSync}
              disabled={syncLoading || loading}
              className="flex items-center gap-1.5 border border-gray-600 text-gray-300 hover:border-[#67986A]/60 hover:text-white rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
              title="Automated project sync directly to Calibrator & EnergyPlus"
            >
              {syncLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-3.5 h-3.5 text-[#67986A]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              )}
              {syncLoading ? 'Syncing to Calibrator…' : 'Project Sync / Calibrator'}
            </button>

            {summary.unsortedPhotosDetected && (
              <button
                onClick={onSortPhotos}
                disabled={photoSortLoading}
                className="flex items-center gap-1.5 border border-amber-600/80 text-amber-300 hover:bg-amber-950/40 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {photoSortLoading && (
                  <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                )}
                Sort Photos
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onDownloadCsv}
              disabled={isBlocked || loading}
              className="border border-[#67986A] text-[#67986A] hover:bg-[#67986A]/10 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
              title="Download equipment inventory CSV"
            >
              CSV
            </button>
            <button
              onClick={onDownloadExcel}
              disabled={isBlocked || loading}
              className="bg-[#67986A] hover:bg-[#5a8a5d] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
