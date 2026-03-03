"use client";
import { useEffect, useState } from 'react';

interface ServiceRow {
  machineName: string;
  lastServiceDate: string;
  hoursAtService: number | null;
  nextDueHours: number | null;
  currentHours: number | null;
  hoursToService: number | null;
  serviceInterval: number;
}

function StatusBadge({ hours }: { hours: number | null }) {
  if (hours === null) return <span className="text-slate-500 text-xs">—</span>;
  if (hours <= 0) return <span className="flex items-center gap-1 text-xs text-red-400 font-medium"><span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>Overdue</span>;
  if (hours <= 50) return <span className="flex items-center gap-1 text-xs text-amber-400 font-medium"><span className="w-2 h-2 rounded-full bg-amber-400"></span>Due Soon</span>;
  return <span className="flex items-center gap-1 text-xs text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400"></span>OK</span>;
}

function rowBg(hours: number | null) {
  if (hours === null) return '';
  if (hours <= 0) return 'bg-red-900/20 border-l-2 border-l-red-500';
  if (hours <= 50) return 'bg-amber-900/10 border-l-2 border-l-amber-500';
  return '';
}

function ProgressBar({ hours, interval }: { hours: number | null; interval: number }) {
  if (hours === null) return <div className="w-full h-1.5 bg-slate-700 rounded-full" />;
  const pct = Math.max(0, Math.min(100, (hours / interval) * 100));
  const color = hours <= 0 ? 'bg-red-500' : hours <= 50 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function ServicesPage() {
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/services').then(r => r.json()).then(d => { setRows(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const overdue = rows.filter(r => r.hoursToService !== null && r.hoursToService <= 0).length;
  const dueSoon = rows.filter(r => r.hoursToService !== null && r.hoursToService > 0 && r.hoursToService <= 50).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🔧 Service Tracker</h1>
          <p className="text-slate-400 mt-1 text-sm">Live from Services sheet · 250h intervals (500h BULLD 12)</p>
        </div>
        <div className="flex gap-3">
          {overdue > 0 && <span className="bg-red-600/20 text-red-400 border border-red-600/40 text-xs px-3 py-1 rounded-full font-medium">{overdue} Overdue</span>}
          {dueSoon > 0 && <span className="bg-amber-600/20 text-amber-400 border border-amber-600/40 text-xs px-3 py-1 rounded-full font-medium">{dueSoon} Due Soon</span>}
        </div>
      </div>

      {loading ? (
        <div className="text-slate-400 py-12 text-center">Loading service data...</div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">Machine</th>
                  <th className="text-right px-4 py-3 font-medium">Current h</th>
                  <th className="text-right px-4 py-3 font-medium">Next Due</th>
                  <th className="text-right px-4 py-3 font-medium">Remaining</th>
                  <th className="text-left px-4 py-3 font-medium w-32">Progress</th>
                  <th className="text-left px-4 py-3 font-medium">Last Service</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {rows.map((row) => (
                  <tr key={row.machineName} className={`hover:bg-slate-800/40 transition-colors ${rowBg(row.hoursToService)}`}>
                    <td className="px-5 py-3 font-medium text-white">{row.machineName}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{row.currentHours?.toLocaleString('en-ZA') ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{row.nextDueHours?.toLocaleString('en-ZA') ?? '—'}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${row.hoursToService !== null && row.hoursToService <= 0 ? 'text-red-400' : row.hoursToService !== null && row.hoursToService <= 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {row.hoursToService !== null ? (row.hoursToService <= 0 ? `${Math.abs(row.hoursToService)}h overdue` : `${row.hoursToService}h`) : '—'}
                    </td>
                    <td className="px-4 py-3 w-32">
                      <ProgressBar hours={row.hoursToService} interval={row.serviceInterval} />
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{row.lastServiceDate || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge hours={row.hoursToService} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
