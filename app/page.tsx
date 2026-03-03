"use client";
import { useEffect, useState, useCallback } from 'react';

interface Machine {
  code: string;
  tabName: string;
  startHours: number | null;
  stopHours: number | null;
  hoursWorked: number | null;
  dieselLitres: number | null;
  isADT: boolean;
  quarryLoads?: number | null;
  screenLoads?: number | null;
  tailingsLoads?: number | null;
  totalLoads?: number | null;
  tonsMoved?: number | null;
  payload?: number;
  error?: string;
}

function StatusBadge({ machine }: { machine: Machine }) {
  if (machine.error) return <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-600"></span>Error</span>;
  if (machine.stopHours != null) return <span className="flex items-center gap-1.5 text-xs text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400"></span>Operational</span>;
  if (machine.startHours != null) return <span className="flex items-center gap-1.5 text-xs text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-400"></span>Running</span>;
  return <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-600"></span>No Data</span>;
}

function MachineCard({ machine }: { machine: Machine }) {
  const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString('en-ZA') : '—';
  return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-bold text-slate-100 text-sm">{machine.code}</div>
          <div className="text-slate-500 text-xs mt-0.5 leading-tight">{machine.tabName}</div>
        </div>
        <StatusBadge machine={machine} />
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Start</span>
          <span className="text-slate-200 font-mono">{fmt(machine.startHours)}h</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Stop</span>
          <span className="text-slate-200 font-mono">{fmt(machine.stopHours)}h</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Worked</span>
          <span className={`font-mono font-medium ${machine.hoursWorked ? 'text-emerald-400' : 'text-slate-500'}`}>
            {machine.hoursWorked != null ? `${machine.hoursWorked.toFixed(1)}h` : '—'}
          </span>
        </div>
        <div className="flex justify-between border-t border-slate-700 pt-1.5 mt-1.5">
          <span className="text-slate-500">Diesel</span>
          <span className="text-amber-400 font-mono">{machine.dieselLitres != null ? `${fmt(machine.dieselLitres)}L` : '—'}</span>
        </div>
        {machine.isADT && (
          <div className="border-t border-slate-700 pt-1.5 mt-1.5 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Quarry</span>
              <span className="text-slate-200 font-mono">{fmt(machine.quarryLoads)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Screen</span>
              <span className="text-slate-200 font-mono">{fmt(machine.screenLoads)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tailings</span>
              <span className="text-slate-200 font-mono">{fmt(machine.tailingsLoads)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-700 pt-1">
              <span className="text-slate-500">Tons Moved</span>
              <span className="text-emerald-400 font-mono font-medium">{machine.tonsMoved ? `${fmt(machine.tonsMoved)}T` : '—'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 animate-pulse">
      <div className="h-4 bg-slate-700 rounded w-20 mb-2"></div>
      <div className="h-3 bg-slate-700 rounded w-32 mb-4"></div>
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <div key={i} className="h-3 bg-slate-700 rounded"></div>)}
      </div>
    </div>
  );
}

export default function FleetPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet');
      const data = await res.json();
      setMachines(data);
      setLastUpdated(new Date());
    } catch { /* ok */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const operational = machines.filter(m => m.stopHours != null || m.startHours != null || m.dieselLitres != null).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Fleet Status</h1>
          <a href="/exceptions" className="text-xs text-slate-300 underline">Exceptions</a>
          <p className="text-slate-400 text-sm mt-1">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-ZA')}` : 'Loading...'}
            {!loading && ` · ${operational}/${machines.length} operational`}
          </p>
        </div>
        <button onClick={fetchData} className="text-xs text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors">
          ↻ Refresh
        </button>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(12)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {machines.map(m => <MachineCard key={m.code} machine={m} />)}
        </div>
      )}
    </div>
  );
}
