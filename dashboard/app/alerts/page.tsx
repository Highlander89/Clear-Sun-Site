"use client";
import { useEffect, useState, useCallback } from 'react';

interface ServiceAlert { type: string; machine: string; hoursToService: number; severity: string; message: string; }
interface FuelAlert { type: string; severity: string; message: string; stockOnHand: number; }
interface Health { botStatus: string; uptimeSeconds: number; lastMessageTs: string | null; queueDepth: number; restartCount?: number; heapMb?: number; }

function fmt(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function SeverityBadge({ s }: { s: string }) {
  const c = s === 'critical' ? 'bg-red-600/20 text-red-400 border-red-600/40' : 'bg-amber-600/20 text-amber-400 border-amber-600/40';
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${c}`}>{s}</span>;
}

export default function AlertsPage() {
  const [serviceAlerts, setServiceAlerts] = useState<ServiceAlert[]>([]);
  const [fuelAlerts, setFuelAlerts] = useState<FuelAlert[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/alerts').then(r => r.json()),
      fetch('/api/health').then(r => r.json()),
    ]).then(([alerts, h]) => {
      const sorted = (alerts.serviceAlerts || []).sort((a: ServiceAlert, b: ServiceAlert) =>
        a.severity === b.severity ? a.hoursToService - b.hoursToService : a.severity === 'critical' ? -1 : 1
      );
      setServiceAlerts(sorted);
      setFuelAlerts(alerts.fuelAlerts || []);
      setHealth(h);
      setLoading(false);
      setLastRefresh(new Date());
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const totalAlerts = serviceAlerts.length + fuelAlerts.length;
  const critical = serviceAlerts.filter(a => a.severity === 'critical').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🚨 Alerts & Health</h1>
          <p className="text-slate-400 mt-1 text-sm">Refreshes every 60s · Last: {lastRefresh.toLocaleTimeString('en-ZA')}</p>
        </div>
        {totalAlerts > 0 && <span className="bg-red-600/20 text-red-400 border border-red-600/40 text-xs px-3 py-1 rounded-full font-medium">{totalAlerts} Active Alert{totalAlerts !== 1 ? 's' : ''}</span>}
      </div>

      {/* Pipeline Health */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700 bg-slate-800/80">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">📡 Pipeline Health</h2>
        </div>
        {health ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-slate-700">
            {[
              { label: 'Bot Status', value: health.botStatus, color: health.botStatus === 'online' ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Uptime', value: fmt(health.uptimeSeconds), color: 'text-slate-200' },
              { label: 'Queue Depth', value: String(health.queueDepth ?? '—'), color: (health.queueDepth ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400' },
              { label: 'Last Message', value: health.lastMessageTs ? new Date(health.lastMessageTs).toLocaleTimeString('en-ZA') : 'None', color: 'text-slate-200' },
            ].map(s => (
              <div key={s.label} className="px-5 py-4 text-center">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{s.label}</div>
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        ) : <div className="px-5 py-4 text-slate-500 text-sm">Loading health data...</div>}
      </div>

      {/* Service Alerts */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700 bg-slate-800/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">🔧 Service Alerts</h2>
          {critical > 0 && <span className="text-xs text-red-400">{critical} critical</span>}
        </div>
        {loading ? <div className="px-5 py-6 text-slate-500 text-sm">Loading...</div> :
         serviceAlerts.length === 0 ? (
          <div className="px-5 py-8 text-center"><div className="text-2xl mb-2">✅</div><div className="text-slate-400 text-sm">No service alerts — all machines within safe range</div></div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {serviceAlerts.map((a, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-slate-800/30">
                <div>
                  <span className="text-white font-medium text-sm">{a.machine}</span>
                  <p className="text-slate-400 text-xs mt-0.5">{a.message}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-mono font-bold ${a.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`}>
                    {a.hoursToService <= 0 ? `${Math.abs(a.hoursToService)}h overdue` : `${a.hoursToService}h left`}
                  </span>
                  <SeverityBadge s={a.severity} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fuel Alerts */}
      {fuelAlerts.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700 bg-slate-800/80">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">⛽ Fuel Alerts</h2>
          </div>
          <div className="divide-y divide-slate-700/50">
            {fuelAlerts.map((a, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-slate-800/30">
                <p className="text-slate-300 text-sm">{a.message}</p>
                <div className="flex items-center gap-3">
                  <span className="text-amber-400 font-mono text-sm">{a.stockOnHand?.toLocaleString('en-ZA')}L</span>
                  <SeverityBadge s={a.severity} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && totalAlerts === 0 && (
        <div className="bg-emerald-900/10 border border-emerald-700/30 rounded-xl px-6 py-8 text-center">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-emerald-400 font-medium">All systems clear — no active alerts</div>
        </div>
      )}
    </div>
  );
}
