"use client";
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface ADTRow { code: string; tabName: string; quarryLoads: number | null; screenLoads: number | null; tailingsLoads: number | null; totalLoads: number; tonsMoved: number; }
interface HoursRow { code: string; tabName: string; hoursThisMonth: number | null; }

export default function ProductionPage() {
  const [adtLoads, setAdtLoads] = useState<ADTRow[]>([]);
  const [machineHours, setMachineHours] = useState<HoursRow[]>([]);
  const [loading, setLoading] = useState(true);
  const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString('en-ZA') : '—';

  useEffect(() => {
    fetch('/api/production').then(r => r.json()).then(d => {
      setAdtLoads(d.adtLoads || []);
      setMachineHours(d.machineHours || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const totalTons = adtLoads.reduce((s, r) => s + r.tonsMoved, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Production Summary</h1>
        {!loading && <p className="text-slate-400 text-sm mt-1">Total tons moved: <span className="text-emerald-400 font-medium">{fmt(totalTons)}T</span></p>}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-slate-700"><h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">ADT Loads</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700">
              <tr>
                {['Machine', 'Quarry', 'Screen', 'Tailings', 'Total Loads', 'Tons Moved'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-300 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? [...Array(6)].map((_, i) => (
                <tr key={i} className="border-t border-slate-700">
                  {[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-700 rounded animate-pulse"></div></td>)}
                </tr>
              )) : adtLoads.map((r, i) => (
                <tr key={i} className={`border-t border-slate-700/50 ${i % 2 ? 'bg-slate-800/50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-slate-100">{r.code}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono">{fmt(r.quarryLoads)}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono">{fmt(r.screenLoads)}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono">{fmt(r.tailingsLoads)}</td>
                  <td className="px-4 py-3 text-slate-200 font-mono font-medium">{fmt(r.totalLoads)}</td>
                  <td className="px-4 py-3 text-emerald-400 font-mono font-bold">{fmt(r.tonsMoved)}T</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adtLoads.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Tons Moved by ADT</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={adtLoads}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="code" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} itemStyle={{ color: '#34d399' }} />
              <Bar dataKey="tonsMoved" fill="#34d399" radius={[4, 4, 0, 0]} name="Tons Moved" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-slate-700"><h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Machine Hours This Month</h2></div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-slate-300 font-medium">Machine</th>
                <th className="px-4 py-3 text-right text-slate-300 font-medium">Hours (MTD)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? [...Array(8)].map((_, i) => (
                <tr key={i} className="border-t border-slate-700">
                  {[...Array(2)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-700 rounded animate-pulse"></div></td>)}
                </tr>
              )) : machineHours.filter(r => r.hoursThisMonth).map((r, i) => (
                <tr key={i} className={`border-t border-slate-700/50 ${i % 2 ? 'bg-slate-800/50' : ''}`}>
                  <td className="px-4 py-3 text-slate-200">{r.code} <span className="text-slate-500 text-xs">· {r.tabName}</span></td>
                  <td className="px-4 py-3 text-right text-emerald-400 font-mono font-medium">{fmt(r.hoursThisMonth)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
