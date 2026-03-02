"use client";

const CLEARSUN_JOBS = [
  { name: "ClearSun Production Monitor", schedule: "Every 10min (06:00–19:00 SAST)", status: "ok", description: "Monitors PM2 process health, detects new WA messages, checks for processing errors." },
  { name: "Replay Queue + Stability Check", schedule: "Hourly", status: "ok", description: "Replays any queued messages that failed initial Sheets append. Reports heap usage and restart count." },
  { name: "Daily PM2 Restart", schedule: "03:00 SAST", status: "ok", description: "Routine restart to manage heap memory. Prevents OOM crashes during business hours." },
  { name: "Nightly Backup to SAPCONET", schedule: "21:00 SAST", status: "ok", description: "Tarballs all spec files, memory, source code, and dashboard pages to ~/clearsun-backups/ on SAPCONET." },
  { name: "Daily Service/Fuel Alert", schedule: "17:00 SAST", status: "ok", description: "Alerts WA group: machines overdue for service, machines ≤50h to service, fuel stock < 20,000L." },
  { name: "Weekly Production Report", schedule: "Saturday 14:00 SAST", status: "ok", description: "ROM tons, loads by material type, hours summary. Source: individual machine tab daily rows (Mon–Sat)." },
  { name: "Monthly Production Summary", schedule: "1st of month 08:00 SAST", status: "ok", description: "Fuel used, fuel cost, replacement cost, ROM tons, loads breakdown (Quarry/Screen/Tailings)." },
  { name: "Oil Stock Take Reminder", schedule: "2nd of month 09:00 SAST", status: "ok", description: "Reminds to do oil stock taking. Lists machines due within 150h of next service." },
  { name: "PEP Safety Talk Reminder", schedule: "Thursday 10:00 SAST", status: "ok", description: "Friendly reminder to prepare PEP safety talk for tomorrow's safety meeting." },
  { name: "Plant Safety Checklist Reminder", schedule: "Friday 09:00 SAST", status: "ok", description: "Friendly reminder to do the weekly Plant Safety Checklist." },
  { name: "Screen Checklist Reminder", schedule: "Monday 09:00 SAST", status: "ok", description: "Friendly reminder to do weekly Screen Checklist." },
];

function StatusBadge({ status }: { status: string }) {
  const c: Record<string,string> = { ok: "bg-emerald-600/20 text-emerald-400 border-emerald-600/40", error: "bg-red-600/20 text-red-400 border-red-600/40", pending: "bg-yellow-600/20 text-yellow-400 border-yellow-600/40" };
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${c[status]||c.pending}`}>{status}</span>;
}

export default function RemindersPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">⏰ Scheduled Jobs &amp; Reminders</h1>
        <p className="text-slate-400 mt-1">All automated jobs, alerts, and reminders for ClearSun operations.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { n: CLEARSUN_JOBS.length, l: "Total Jobs", c: "text-emerald-400" },
          { n: 3, l: "Weekly Reminders", c: "text-emerald-400" },
          { n: 2, l: "Monthly Reports", c: "text-emerald-400" },
          { n: 1, l: "Daily Alert", c: "text-amber-400" },
        ].map(s => (
          <div key={s.l} className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 text-center">
            <div className={`text-2xl font-bold ${s.c}`}>{s.n}</div>
            <div className="text-xs text-slate-400 mt-1">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/80">
          <h2 className="text-lg font-semibold text-white">📋 Job Status Board</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700 text-slate-400">
              <th className="text-left px-6 py-3 font-medium">Job Name</th>
              <th className="text-left px-4 py-3 font-medium">Schedule</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Description</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/50">
              {CLEARSUN_JOBS.map(j => (
                <tr key={j.name} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-3"><span className="text-white font-medium">{j.name}</span></td>
                  <td className="px-4 py-3"><span className="text-slate-300 text-xs font-mono">{j.schedule}</span></td>
                  <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><span className="text-slate-400 text-xs">{j.description}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/80">
          <h2 className="text-lg font-semibold text-white">🕐 Daily Schedule</h2>
        </div>
        <div className="px-6 py-4 space-y-3">
          {[
            { time: "03:00", label: "PM2 Restart (heap cleanup)", icon: "🔄" },
            { time: "06:00–19:00", label: "Production Monitor (every 10min)", icon: "📡" },
            { time: "Every hour", label: "Replay Queue + Stability Check", icon: "🔁" },
            { time: "09:00 Mon", label: "Screen Checklist Reminder", icon: "📋" },
            { time: "10:00 Thu", label: "PEP Safety Talk Reminder", icon: "🦺" },
            { time: "09:00 Fri", label: "Plant Safety Checklist Reminder", icon: "🛡️" },
            { time: "14:00 Sat", label: "Weekly Production Report", icon: "📊" },
            { time: "17:00", label: "Service/Fuel Alert", icon: "⚠️" },
            { time: "21:00", label: "Nightly Backup to SAPCONET", icon: "💾" },
            { time: "1st 08:00", label: "Monthly Production Summary", icon: "📈" },
            { time: "2nd 09:00", label: "Oil Stock Take Reminder", icon: "🛢️" },
          ].map(i => (
            <div key={i.label} className="flex items-center gap-3">
              <span className="text-lg">{i.icon}</span>
              <span className="text-amber-400 font-mono text-xs w-32 flex-shrink-0">{i.time}</span>
              <span className="text-slate-300 text-sm">{i.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-slate-800/30 rounded-xl border border-slate-700 px-6 py-4">
        <p className="text-slate-500 text-xs">Last updated: 2 March 2026 · All times SAST (UTC+2)</p>
      </div>
    </div>
  );
}
