"use client";
import { useEffect, useState } from 'react';

interface ServiceAlert { type: string; machine: string; hoursToService: number; severity: string; message: string; }
interface FuelAlert { type: string; severity: string; message: string; stockOnHand: number; }
interface Health { botStatus: string; uptimeSeconds: number; lastMessageTs: string | null; queueDepth: number; }

export default function AlertsPage() {
  const [serviceAlerts, setServiceAlerts] = useState<ServiceAlert[]>([]);
  const [fuelAlerts, setFuelAlerts] = useState<FuelAlert[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    }).catch(() => setLoading(false));
    const interval = setInterval(() => {
      Promise.all([
        fetch('/api/alerts').then(r => r.json()),
        fetch('/api/health').then(r => r.json()),
      ]).then(([alerts, h]) => {
        setServiceAlerts(alerts.serviceAlerts || []);
        setFuelAlerts(alerts.fuelAlerts || []);
        setHealth(h);
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const fmtUptime = (s: number) => {
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const fmtTime = (ts: string | null) => {
    if (!ts) return 'Unknown';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-ZA') + ' ' + d.toLocaleDateString('en-ZA');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Alerts</h1>
        <p className="text-slate-400 text-sm mt-1">{serviceAlerts.length + fuelAlerts.length} active alerts</p>
      </div>

      {/* Pipeline Health */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Pipeline Health</h2>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-700 rounded-lg animate-pulse"></div>)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Bot Status</div>
              <div className={`flex items-center gap-2 font-medium ${health?.botStatus === 'online' ? 'text-emerald-400' : 'text-red-400'}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${health?.botStatus === 'online' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                {health?.botStatus === 'online' ? 'Online' : 'Offline'}
              </div>
            </div>
            <div className="bg-slate-900 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Uptime</div>
              <div className="text-slate-200 font-medium">{health ? fmtUptime(health.uptimeSeconds) : '—'}</div>
            </div>
            <div className="bg-slate-900 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Last Message</div>
              <div className="text-slate-200 text-xs">{fmtTime(health?.lastMessageTs || null)}</div>
            </div>
            <div className="bg-slate-900 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Queue Depth</div>
              <div className={`font-medium ${(health?.queueDepth || 0) > 5 ? 'text-amber-400' : 'text-slate-200'}`}>{health?.queueDepth ?? '—'}</div>
            </div>
          </div>
        )}
      </div>

      {/* Fuel Alerts */}
      {fuelAlerts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Fuel Alerts</h2>
          {fuelAlerts.map((a, i) => (
            <div key={i} className="bg-red-900/30 border border-red-700/50 rounded-xl p-4 flex items-center gap-4">
              <span className="text-2xl">⛽</span>
              <div>
                <div className="font-medium text-red-300">{a.message}</div>
                <div className="text-xs text-red-400/70 mt-0.5">Refuel required urgently</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Service Alerts */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Service Alerts</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-slate-800 rounded-xl animate-pulse"></div>)}
          </div>
        ) : serviceAlerts.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-500">
            <div className="text-3xl mb-2">✅</div>
            No service alerts
          </div>
        ) : (
          <div className="space-y-3">
            {serviceAlerts.map((a, i) => (
              <div key={i} className={`border-2 rounded-xl p-4 flex items-center gap-4 ${a.severity === 'critical' ? 'bg-red-950 border-red-500' : 'bg-amber-950 border-amber-500'}`}>
                <span className="text-2xl">{a.severity === 'critical' ? '🔴' : '🟠'}</span>
                <div className="flex-1">
                  <div className={`font-semibold ${a.severity === 'critical' ? 'text-red-300' : 'text-amber-300'}`}>{a.machine}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{a.message}</div>
                </div>
                <div className={`text-right text-sm font-mono font-bold ${a.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`}>
                  {a.hoursToService <= 0 ? `${Math.abs(a.hoursToService).toFixed(0)}h overdue` : `${a.hoursToService.toFixed(0)}h left`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
