"use client";
import { useEffect, useState } from 'react';

interface ServiceRow {
  machineName: string;
  hoursToService: number | null;
  serviceInterval: number;
}

function StatusBadge({ hours }: { hours: number | null }) {
  if (hours === null) return <span className="text-slate-500 text-xs">Unknown</span>;
  if (hours <= 0) return <span className="flex items-center gap-1 text-xs text-red-400 font-medium"><span className="w-2 h-2 rounded-full bg-red-400"></span>Overdue</span>;
  if (hours <= 50) return <span className="flex items-center gap-1 text-xs text-amber-400 font-medium"><span className="w-2 h-2 rounded-full bg-amber-400"></span>Due Soon</span>;
  return <span className="flex items-center gap-1 text-xs text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400"></span>OK</span>;
}

function rowBg(hours: number | null) {
  if (hours === null) return '';
  if (hours <= 0) return 'bg-red-900/30 border-l-2 border-l-red-500';
  if (hours <= 50) return 'bg-amber-900/20 border-l-2 border-l-amber-500';
  return '';
}

export default function ServicesPage() {
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/services')
      .then(r => r.json())
      .then(data => { setRows(data.sort((a: ServiceRow, b: ServiceRow) => (a.hoursToService ?? 9999) - (b.hoursToService ?? 9999))); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const overdue = rows.filter(r => r.hoursToService !== null && r.hoursToService <= 0).length;
  const warning = rows.filter(r => r.hoursToService !== null && r.hoursToService > 0 && r.hoursToService <= 50).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Service Tracker</h1>
        <div className="flex gap-4 mt-2">
          {overdue > 0 && <span className="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded-full">{overdue} Overdue</span>}
          {warning > 0 && <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-1 rounded-full">{warning} Due Soon</span>}
        </div>
      </div>
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-slate-300 font-medium">Machine</th>
                <th className="text-right px-4 py-3 text-slate-300 font-medium">Interval</th>
                <th className="text-right px-4 py-3 text-slate-300 font-medium">Hours to Next</th>
                <th className="text-center px-4 py-3 text-slate-300 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-t border-slate-700">
                    {[...Array(4)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-700 rounded animate-pulse"></div></td>
                    ))}
                  </tr>
                ))
              ) : rows.map((row, i) => (
                <tr key={i} className={`border-t border-slate-700/50 ${rowBg(row.hoursToService)} ${i % 2 === 0 ? '' : 'bg-slate-800/50'}`}>
                  <td className="px-4 py-3 text-slate-100 font-medium">{row.machineName}</td>
                  <td className="px-4 py-3 text-right text-slate-400">{row.serviceInterval}h</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">
                    {row.hoursToService !== null ? (
                      <span className={row.hoursToService <= 0 ? 'text-red-400' : row.hoursToService <= 50 ? 'text-amber-400' : 'text-slate-200'}>
                        {row.hoursToService <= 0 ? `${row.hoursToService.toFixed(0)}h` : `${row.hoursToService.toFixed(0)}h`}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge hours={row.hoursToService} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
