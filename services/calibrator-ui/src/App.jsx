import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Zap, Leaf, Building, Lock, UploadCloud, FileSpreadsheet, ArrowLeft, Loader2, Search, FolderOpen, Kanban as Trello } from 'lucide-react';

export default function App() {
  const [view, setView] = useState('dashboard');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Asana State
  const [jobBoardTab, setJobBoardTab] = useState('local'); // 'local' | 'asana'
  const [asanaJobs, setAsanaJobs] = useState([]);
  const [loadingAsana, setLoadingAsana] = useState(false);

  // Fetch Local Jobs
  useEffect(() => {
    fetch('/api/calibrator/jobs')
      .then(res => res.json())
      .then(data => {
        const jobList = Array.isArray(data) ? data : (data.jobs || []);
        setJobs(jobList);
        if (jobList.length > 0 && !selectedJobId) {
          setSelectedJobId(jobList[0].id || jobList[0].site_hunter_job_id);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch jobs:", err);
        setLoading(false);
      });
  }, []);

  // Fetch Asana Jobs when tab is selected
  useEffect(() => {
    if (view === 'jobs' && jobBoardTab === 'asana' && asanaJobs.length === 0) {
      setLoadingAsana(true);
      fetch('/api/asana/jobs')
        .then(res => res.json())
        .then(data => {
          setAsanaJobs(data.jobs || []);
          setLoadingAsana(false);
        })
        .catch(err => {
          console.error("Failed to fetch Asana jobs:", err);
          setLoadingAsana(false);
        });
    }
  }, [view, jobBoardTab, asanaJobs.length]);

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val || 0);
  const formatNumber = (val) => new Intl.NumberFormat('en-US').format(val || 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500"/>
        <p className="text-slate-500 font-medium tracking-wide animate-pulse">Loading Calibrator Models...</p>
      </div>
    );
  }

  // --- UPLOAD VIEW ---
  if (view === 'upload') {
    return (
      <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans text-slate-800 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <button onClick={() => setView('dashboard')} className="flex items-center text-sm text-slate-500 hover:text-slate-800 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2"/> Back to Dashboard
          </button>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Upload External Job</h2>
            <p className="text-slate-500 mt-2">Drag and drop a completed Submission Form to run a new simulation.</p>
          </div>
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center hover:bg-slate-50 hover:border-emerald-300 transition-all cursor-pointer group">
            <UploadCloud className="w-12 h-12 text-slate-300 group-hover:text-emerald-500 mx-auto mb-4 transition-colors"/>
            <p className="font-medium text-slate-700">Drop your Excel file here, or click to browse</p>
            <p className="text-xs text-slate-400 mt-2">Supports .xlsx (Submission Form Template)</p>
          </div>
        </div>
      </div>
    );
  }

  // --- JOB BOARD VIEW ---
  if (view === 'jobs') {
    const filteredLocalJobs = jobs.filter(j => {
      const searchStr = searchQuery.toLowerCase();
      const name = (j.project_name || j.job_name || '').toLowerCase();
      const id = (j.site_hunter_job_id || j.id || '').toLowerCase();
      return name.includes(searchStr) || id.includes(searchStr);
    });

    const filteredAsanaJobs = asanaJobs.filter(j => {
      const searchStr = searchQuery.toLowerCase();
      const name = (j.job_name || '').toLowerCase();
      const id = (j.id || '').toLowerCase();
      const notes = (j.notes || '').toLowerCase();
      return name.includes(searchStr) || id.includes(searchStr) || notes.includes(searchStr);
    });

    return (
      <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans text-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setView('dashboard')} className="flex items-center text-sm text-slate-500 hover:text-slate-800 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2"/> Back to Dashboard
            </button>
            <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
              <button 
                onClick={() => setJobBoardTab('local')}
                className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${jobBoardTab === 'local' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Local Models {jobs.length > 0 && `(${jobs.length})`}
              </button>
              <button 
                onClick={() => setJobBoardTab('asana')}
                className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-all ${jobBoardTab === 'asana' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Trello className="w-4 h-4 mr-2"/> Asana Pipeline {asanaJobs.length > 0 && `(${asanaJobs.length})`}
              </button>
            </div>
          </div>
          
          {/* Universal Search Bar */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8 flex items-center space-x-4">
            <Search className="w-5 h-5 text-slate-400"/>
            <input 
              type="text" 
              placeholder={jobBoardTab === 'local' ? "Search local models by project name or Job ID..." : "Search all Asana jobs, projects, or notes..."} 
              className="flex-grow text-lg outline-none text-slate-700 bg-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {jobBoardTab === 'local' ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredLocalJobs.map(job => (
                <div 
                  key={job.id || job.site_hunter_job_id} 
                  onClick={() => { setSelectedJobId(job.id || job.site_hunter_job_id); setView('dashboard'); }}
                  className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-300 hover:shadow-md cursor-pointer transition-all"
                >
                  <h3 className="font-bold text-slate-900 truncate text-lg mb-1">{job.project_name || job.job_name || 'Unnamed Project'}</h3>
                  <p className="text-xs font-mono text-slate-400 mb-4 truncate">ID: {job.site_hunter_job_id}</p>
                  <div className="flex justify-between items-center text-sm text-slate-600">
                    <span>{job.device_count || 0} Units</span>
                    <span className="font-semibold text-emerald-600">
                      {formatCurrency(job.annual_savings_dollars || job.savings_dollars || 0)}
                    </span>
                  </div>
                </div>
              ))}
              {filteredLocalJobs.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500">
                  No local projects found matching "{searchQuery}".
                </div>
              )}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {loadingAsana ? (
                <div className="col-span-full py-12 flex flex-col items-center text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-4"/>
                  Fetching all live jobs from Asana...
                </div>
              ) : (
                filteredAsanaJobs.map(job => (
                  <div key={job.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-bold text-slate-900 truncate text-lg" title={job.job_name}>{job.job_name}</h3>
                        {job.type && (
                          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ml-2 shrink-0 ${job.type === 'project' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                            {job.type === 'project' ? 'Project' : 'Pipeline'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-slate-400 mb-3">Asana ID: {job.id}</p>
                      <p className="text-sm text-slate-600 line-clamp-2 mb-6">{job.notes || "No notes provided."}</p>
                    </div>
                    <button 
                      onClick={() => alert(`Initiating import for ${job.job_name}...`)}
                      className="w-full py-2.5 bg-slate-50 hover:bg-emerald-50 text-emerald-600 font-medium rounded-xl transition-colors border border-slate-200 hover:border-emerald-200"
                    >
                      Import to Calibrator
                    </button>
                  </div>
                ))
              )}
              {!loadingAsana && filteredAsanaJobs.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500">
                  No Asana jobs found matching "{searchQuery}".
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- MAIN DASHBOARD VIEW ---
  const activeJob = jobs.find(j => (j.id === selectedJobId || j.site_hunter_job_id === selectedJobId)) || jobs[0];

  if (!activeJob) return null;

  const data = {
    name: activeJob.project_name || activeJob.job_name || `Job ID: ${activeJob.site_hunter_job_id}`,
    baseline_kwh: activeJob.baseline_kwh,
    proposed_kwh: activeJob.proposed_kwh,
    savings_dollars: activeJob.annual_savings_dollars || activeJob.savings_dollars || 0,
    savings_kwh: activeJob.savings_kwh || (activeJob.baseline_kwh - activeJob.proposed_kwh),
    tonnage: activeJob.total_tonnage || 0,
    devices: activeJob.device_count || 0,
    archetype: activeJob.archetype || "DOE Commercial Prototype"
  };

  const chartData = [
    { name: 'Current Baseline', kwh: data.baseline_kwh, color: '#94a3b8' },
    { name: 'Proposed ECM', kwh: data.proposed_kwh, color: '#10b981' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans text-slate-800">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="text-left space-y-1 flex-grow">
            <h1 className="text-2xl font-bold text-slate-900">{data.name}</h1>
            <p className="text-slate-500 uppercase tracking-widest text-xs font-semibold">Calibrated Energy Model Summary</p>
          </div>
          <div className="mt-4 md:mt-0 flex space-x-3">
            <button onClick={() => setView('jobs')} className="inline-flex items-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2.5 rounded-xl transition-colors text-sm border border-slate-200">
              <FolderOpen className="w-4 h-4 mr-2"/> Browse Jobs
            </button>
            <button onClick={() => setView('upload')} className="inline-flex items-center bg-emerald-500 hover:bg-emerald-600 text-white font-medium px-4 py-2.5 rounded-xl transition-colors text-sm shadow-sm">
              <UploadCloud className="w-4 h-4 mr-2"/> External Job
            </button>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center">
          <h2 className="text-slate-500 font-medium mb-2">Projected Annual Savings</h2>
          <div className="text-6xl font-black text-emerald-500 tracking-tight">
            {formatCurrency(data.savings_dollars)}
          </div>
          <p className="text-slate-400 mt-4 text-sm">Based on {formatNumber(data.savings_kwh)} kWh overall site reduction</p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-80 flex flex-col">
            <h3 className="font-semibold text-slate-700 mb-6 flex items-center"><Zap className="w-5 h-5 mr-2 text-amber-500"/> Energy Consumption (kWh)</h3>
            <div className="flex-grow">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{top: 0, right: 0, left: 0, bottom: 0}}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip cursor={{fill: 'transparent'}} formatter={(value) => formatNumber(value) + " kWh"}/>
                  <Bar dataKey="kwh" radius={[4, 4, 0, 0]} maxBarSize={80}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="font-semibold text-slate-700 mb-4 flex items-center"><Building className="w-5 h-5 mr-2 text-blue-500"/> Site Profile</h3>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex justify-between border-b border-slate-100 pb-2"><span>Equipment Analyzed</span> <span className="font-semibold text-slate-900">{data.devices} Units</span></li>
                <li className="flex justify-between border-b border-slate-100 pb-2"><span>Total Cooling Load</span> <span className="font-semibold text-slate-900">{data.tonnage} Tons</span></li>
                <li className="flex justify-between pb-1"><span>DOE Archetype</span> <span className="font-semibold text-slate-900">{data.archetype}</span></li>
              </ul>
            </div>
            <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100">
              <h3 className="font-semibold text-emerald-800 mb-2 flex items-center"><Leaf className="w-5 h-5 mr-2 text-emerald-600"/> Environmental Impact</h3>
              <p className="text-sm text-emerald-700 leading-relaxed">
                Equivalent to removing <strong>{Math.round(data.savings_kwh * 0.000709 * 1.1)} cars</strong> from the road.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
