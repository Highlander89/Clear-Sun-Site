'use client';

import { useEffect, useState } from 'react';

type AuditRow = {
  ts: string;
  kind: string;
  messageId?: string;
  conversationId?: string;
  rawText?: string;
  summary?: string;
  actions?: any[];
  result?: any;
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch('/api/audit?limit=200', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'failed');
      setRows(j.rows || []);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Audit Trail (Decisions per message)</h1>
      <p style={{ opacity: 0.85 }}>
        Every bot decision: what it parsed, what it wrote, and why (idempotency keys included).
      </p>

      {err && <pre style={{ color: 'crimson' }}>{err}</pre>}

      <div style={{ display: 'flex', gap: 10, margin: '12px 0' }}>
        <button onClick={load} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #111827', background: '#fff' }}>Refresh</button>
        <a href="/operator" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #111827', background: '#fff', display: 'inline-block' }}>Operator Mode</a>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((r, idx) => (
          <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ fontWeight: 800 }}>{r.kind}</div>
              <div style={{ opacity: 0.75 }}>{new Date(r.ts).toLocaleString()}</div>
              {r.messageId && <code>msg:{r.messageId}</code>}
            </div>
            {r.summary && <div style={{ marginTop: 6, opacity: 0.9 }}>{r.summary}</div>}
            {r.rawText && (
              <pre style={{ marginTop: 10, background: '#0b1020', color: '#e5e7eb', padding: 10, borderRadius: 10, overflowX: 'auto' }}>{r.rawText}</pre>
            )}
            {(r.actions && r.actions.length > 0) && (
              <pre style={{ marginTop: 10, background: '#0b1020', color: '#e5e7eb', padding: 10, borderRadius: 10, overflowX: 'auto' }}>{JSON.stringify(r.actions, null, 2)}</pre>
            )}
            {r.result && (
              <pre style={{ marginTop: 10, background: '#0b1020', color: '#e5e7eb', padding: 10, borderRadius: 10, overflowX: 'auto' }}>{JSON.stringify(r.result, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
