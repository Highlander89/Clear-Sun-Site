"use client";
import { useEffect, useState, useCallback } from 'react';

interface ADTRow { code: string; tabName: string; quarryLoads: number | null; screenLoads: number | null; tailingsLoads: number | null; totalLoads: number; tonsMoved: number; }
interface MachineHours { code: string; tabName: string; hoursThisMonth: number | null; }

export default function ProductionPage() {
  const [adtLoads, setAdtLoads] = useState<ADTRow[]>([]);
  const [machineHours, setMachineHours] = useState<MachineHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(() => {
    fetch('/api/production').then(r => r.json()).then(d => {
      setAdtLoads(d.adtLoads || []);
      setMachineHours(d.machineHours || []);
      setLoading(false);
      setLastRefresh(new Date());
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 120000); return () => clearInterval(t); }, [load]);

  const totalTons = adtLoads.reduce((s, r) => s + (r.tonsMoved || 0), 0);
  const totalLoads = adtLoads.reduce((s, r) => s + (r.totalLoads || 0), 0);
  const quarryTotal = adtLoads.reduce((s, r) => s + (r.quarryLoads || 0), 0);
  const screenTotal = adtLoads.reduce((s, r) => s + (r.screenLoads || 0), 0);
  const tailingsTotal = adtLoads.reduce((s, r) => s + (r.tailingsLoads || 0), 0);
  const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString('en-ZA') : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📊 Production Summary</h1>
          <p className="text-slate-400 mt-1 text-sm">Month to date · Refreshes every 2 min · {lastRefresh.toLocaleTimeString('en-ZA')}</p>
        </div>
        <button onClick={load} className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors">↺ Refresh</button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total ROM Tons', value: fmt(totalTons), unit: 'tons', color: 'text-emerald-400' },
          { label: 'Total Loads', value: fmt(totalLoads), unit: 'loads', color: 'text-blue-400' },
          { label: 'Quarry Loads', value: fmt(quarryTotal), unit: 'loads', color: 'text-amber-400' },
          { label: 'Screen Loads', value: fmt(screenTotal), unit: 'loads', color: 'text-teal-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">{s.label}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.unit}</div>
          </div>
        ))}
      </div>

      {/* ADT Loads Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700 bg-slate-800/80">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">🚛 ADT Load Breakdown</h2>
        </div>
        {loading ? <div className="px-5 py-8 text-slate-500 text-sm text-center">Loading...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">ADT</th>
                  <th className="text-right px-4 py-3 font-medium">Quarry</th>
                  <th className="text-right px-4 py-3 font-medium">Screen</th>
                  <th className="text-right px-4 py-3 font-medium">Tailings</th>
                  <th className="text-right px-4 py-3 font-medium">Total Loads</th>
                  <th className="text-right px-4 py-3 font-medium">ROM Tons</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {adtLoads.map(r => (
                  <tr key={r.code} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="text-white font-medium">{r.code}</div>
                      <div className="text-slate-500 text-xs">{r.tabName}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{fmt(r.quarryLoads)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{fmt(r.screenLoads)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{fmt(r.tailingsLoads)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-blue-400">{fmt(r.totalLoads)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-400">{fmt(r.tonsMoved)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-600 bg-slate-800/60 font-semibold">
                  <td className="px-5 py-3 text-slate-200">Total</td>
                  <td className="px-4 py-3 text-right font-mono text-amber-400">{fmt(quarryTotal)}</td>
                  <td className="px-4 py-3 text-right font-mono text-teal-400">{fmt(screenTotal)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300">{fmt(tailingsTotal)}</td>
                  <td className="px-4 py-3 text-right font-mono text-blue-400">{fmt(totalLoads)}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmt(totalTons)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Machine Hours */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700 bg-slate-800/80">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">⏱️ Machine Hours This Month (E35)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">Machine</th>
                <th className="text-right px-4 py-3 font-medium">Hours MTD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {machineHours.filter(m => m.hoursThisMonth != null && m.hoursThisMonth > 0).map(m => (
                <tr key={m.code} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <div className="text-white font-medium">{m.code}</div>
                    <div className="text-slate-500 text-xs">{m.tabName}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-400">{fmt(m.hoursThisMonth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
