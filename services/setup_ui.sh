#!/bin/bash
cd /home/opc/stack/services/calibrator-ui

# 1. Write postcss config so Vite processes Tailwind
cat << 'EOF' > postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

# 2. Write tailwind config
cat << 'EOF' > tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOF

# 3. Write CSS directives
cat << 'EOF' > src/index.css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #f8fafc;
}
EOF

# 4. Write the React Dashboard Code
cat << 'EOF' > src/App.jsx
import React, { useState } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Zap, Leaf, Building, Lock, UploadCloud, FileSpreadsheet, ArrowLeft } from 'lucide-react';

export default function App() {
  const [view, setView] = useState('dashboard');

  const data = {
    name: "Chuck Test - Wayfinder Waikiki",
    baseline_kwh: 1441925,
    proposed_kwh: 1238628,
    savings_dollars: 28461,
    savings_kwh: 203297,
    tonnage: 610.5,
    devices: 14,
    archetype: "Large Hotel (ASHRAE 90.1)"
  };

  const chartData = [
    { name: 'Current Baseline', kwh: data.baseline_kwh, color: '#94a3b8' },
    { name: 'Proposed ECM', kwh: data.proposed_kwh, color: '#10b981' }
  ];

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  const formatNumber = (val) => new Intl.NumberFormat('en-US').format(val);

  if (view === 'upload') {
    return (
      <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans text-slate-800 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <button onClick={() => setView('dashboard')} className="flex items-center text-sm text-slate-500 hover:text-slate-800 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </button>
          
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Upload External Job</h2>
            <p className="text-slate-500 mt-2">Drag and drop a completed Submission Form to run a new simulation.</p>
          </div>

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center hover:bg-slate-50 hover:border-emerald-300 transition-all cursor-pointer group">
            <UploadCloud className="w-12 h-12 text-slate-300 group-hover:text-emerald-500 mx-auto mb-4 transition-colors" />
            <p className="font-medium text-slate-700">Drop your Excel file here, or click to browse</p>
            <p className="text-xs text-slate-400 mt-2">Supports .xlsx (Submission Form Template)</p>
          </div>

          <div className="mt-8 bg-slate-50 p-4 rounded-lg flex items-start">
            <FileSpreadsheet className="w-5 h-5 text-slate-400 mr-3 mt-0.5 shrink-0" />
            <p className="text-sm text-slate-600">
              Ensure the external equipment list maps tonnage, make, and model accurately before uploading. The system will map inputs via the taxonomy bridge.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans text-slate-800">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="text-left space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">{data.name}</h1>
            <p className="text-slate-500 uppercase tracking-widest text-xs font-semibold">Calibrated Energy Model Summary</p>
          </div>
          <button onClick={() => setView('upload')} className="mt-4 md:mt-0 inline-flex items-center bg-emerald-500 hover:bg-emerald-600 text-white font-medium px-4 py-2.5 rounded-xl transition-colors text-sm shadow-sm">
            <UploadCloud className="w-4 h-4 mr-2" /> New External Job
          </button>
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
        <div className="pt-4 text-center">
          <button disabled className="inline-flex items-center justify-center bg-slate-100 text-slate-400 font-medium px-8 py-4 rounded-xl cursor-not-allowed border border-slate-200 w-full md:w-auto shadow-sm">
            <Lock className="w-5 h-5 mr-2" />
            Generate Full Engineering Report
          </button>
        </div>
      </div>
    </div>
  );
}
EOF

# 5. Build production bundle via Docker
docker run --rm -v /home/opc/stack/services/calibrator-ui:/app -w /app node:20-slim npm run build

# 6. Apply permissions for Nginx
sudo chown -R opc:opc /home/opc/stack/services/calibrator-ui/dist
sudo chcon -Rt httpd_sys_content_t /home/opc/stack/services/calibrator-ui/dist
