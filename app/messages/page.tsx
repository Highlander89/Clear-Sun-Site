"use client";
import { useEffect, useState, useCallback } from 'react';

interface Msg { ts: string; sender: string; text: string; machine?: string; type?: string; }

function TypeBadge({ type }: { type?: string }) {
  const map: Record<string, string> = {
    hours: 'bg-blue-600/20 text-blue-400 border-blue-600/40',
    diesel: 'bg-amber-600/20 text-amber-400 border-amber-600/40',
    service: 'bg-purple-600/20 text-purple-400 border-purple-600/40',
    loads: 'bg-teal-600/20 text-teal-400 border-teal-600/40',
    bulk: 'bg-indigo-600/20 text-indigo-400 border-indigo-600/40',
    dip: 'bg-cyan-600/20 text-cyan-400 border-cyan-600/40',
  };
  const c = type ? (map[type] || 'bg-slate-700/50 text-slate-400 border-slate-600') : 'bg-slate-700/50 text-slate-400 border-slate-600';
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${c}`}>{type || 'other'}</span>;
}

export default function MessagesPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(() => {
    fetch('/api/messages?limit=100').then(r => r.json()).then(d => {
      // API already returns newest-first; no reverse needed
      setMsgs(d.messages || []);
      setLoading(false);
      setLastRefresh(new Date());
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const filtered = filter ? msgs.filter(m =>
    m.text?.toLowerCase().includes(filter.toLowerCase()) ||
    m.machine?.toLowerCase().includes(filter.toLowerCase()) ||
    m.type?.toLowerCase().includes(filter.toLowerCase())
  ) : msgs;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">💬 Message Log</h1>
          <p className="text-slate-400 mt-1 text-sm">Last 100 messages · Refreshes every 30s · {lastRefresh.toLocaleTimeString('en-ZA')}</p>
        </div>
        <button onClick={load} className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors">↺ Refresh</button>
      </div>

      <div className="relative">
        <input
          type="text" value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Filter by machine, type, or text..."
          className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-slate-500 placeholder-slate-500"
        />
        {filter && <button onClick={() => setFilter('')} className="absolute right-3 top-2.5 text-slate-500 hover:text-white text-sm">✕</button>}
      </div>

      {loading ? (
        <div className="text-slate-400 py-12 text-center">Loading messages...</div>
      ) : filtered.length === 0 ? (
        <div className="text-slate-500 py-12 text-center">No messages {filter ? 'matching filter' : 'yet'}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((m, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs text-slate-500 font-mono">{new Date(m.ts).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</span>
                    {m.machine && <span className="text-xs text-slate-300 font-medium bg-slate-700 px-2 py-0.5 rounded">{m.machine}</span>}
                    <TypeBadge type={m.type} />
                  </div>
                  <pre className="text-slate-300 text-xs whitespace-pre-wrap break-words font-mono leading-relaxed">{m.text}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
