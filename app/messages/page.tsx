"use client";
import { useEffect, useState } from 'react';

interface Message { ts: string; sender: string; text: string; category: string; priority: string; message_id?: string; }

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = () => fetch('/api/messages').then(r => r.json()).then(d => { setMessages(d); setLoading(false); }).catch(() => setLoading(false));
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);

  const filtered = messages.filter(m =>
    !search || m.text?.toLowerCase().includes(search.toLowerCase()) || m.category?.toLowerCase().includes(search.toLowerCase())
  );

  function categoryBadge(cat: string) {
    const c = cat?.toUpperCase();
    if (c === 'OPERATIONAL') return 'bg-emerald-900/50 text-emerald-400';
    if (c === 'URGENT') return 'bg-red-900/50 text-red-400';
    if (c === 'ADMIN') return 'bg-slate-700 text-slate-400';
    return 'bg-slate-700 text-slate-400';
  }

  function fmtTs(ts: string) {
    try {
      const d = new Date(ts);
      return d.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Message Log</h1>
          <p className="text-slate-400 text-sm mt-1">{messages.length} messages · last 200</p>
        </div>
      </div>
      <input
        type="text"
        placeholder="Search messages..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
      />
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-slate-300 font-medium">Time</th>
                <th className="px-4 py-3 text-left text-slate-300 font-medium">Message</th>
                <th className="px-4 py-3 text-left text-slate-300 font-medium">Category</th>
              </tr>
            </thead>
            <tbody>
              {loading ? [...Array(10)].map((_, i) => (
                <tr key={i} className="border-t border-slate-700">
                  {[...Array(3)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-700 rounded animate-pulse"></div></td>)}
                </tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-12 text-center text-slate-500">No messages found</td></tr>
              ) : filtered.map((m, i) => (
                <tr key={i} className={`border-t border-slate-700/50 ${i % 2 ? 'bg-slate-800/50' : ''}`}>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap font-mono">{fmtTs(m.ts)}</td>
                  <td className="px-4 py-3 text-slate-200 max-w-md">
                    <div className="truncate">{m.text || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryBadge(m.category)}`}>{m.category || 'UNKNOWN'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
