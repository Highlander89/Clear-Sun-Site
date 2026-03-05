'use client';

import { useEffect, useState, useCallback } from 'react';

type AuditRow = {
  ts: string;
  kind: string;
  messageId?: string;
  conversationId?: string;
  rawText?: string;
  summary?: string;
  actions?: unknown[];
  result?: unknown;
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/audit?limit=200', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'failed');
      setRows(j.rows || []);
      setErr(null);
      setLastRefresh(new Date());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Audit Trail (Decisions per message)</h1>
          <p style={{ opacity: 0.6, margin: '4px 0 0', fontSize: 13 }}>
            Every bot decision: what it parsed, what it wrote, and why (idempotency keys included).
            {lastRefresh && (
              <span style={{ marginLeft: 12, color: '#94a3b8' }}>
                Last refreshed: {lastRefresh.toLocaleTimeString('en-ZA')}
              </span>
            )}
          </p>
        </div>
      </div>

      {err && <pre style={{ color: 'crimson', marginTop: 8 }}>{err}</pre>}

      <div style={{ display: 'flex', gap: 10, margin: '12px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid #334155',
            background: loading ? '#1e293b' : '#0f172a',
            color: loading ? '#64748b' : '#e2e8f0',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {loading ? '⟳ Loading…' : '↺ Refresh'}
        </button>
        <a
          href="/operator"
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid #334155',
            background: '#0f172a',
            color: '#e2e8f0',
            fontWeight: 700,
            display: 'inline-block',
            textDecoration: 'none',
          }}
        >
          Operator Mode
        </a>
        <a
          href="/api/audit?limit=1000"
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid #334155',
            background: '#0f172a',
            color: '#e2e8f0',
            fontWeight: 700,
            display: 'inline-block',
            textDecoration: 'none',
          }}
        >
          Download JSON
        </a>
        <span style={{ fontSize: 12, color: '#475569', marginLeft: 4 }}>Auto-refreshes every 15s</span>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((r, idx) => (
          <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ fontWeight: 800 }}>{r.kind}</div>
              <div style={{ opacity: 0.75 }}>{new Date(r.ts).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>
              {r.messageId && <code>msg:{r.messageId}</code>}
            </div>
            {r.summary && <div style={{ marginTop: 6, opacity: 0.9 }}>{r.summary}</div>}
            {r.rawText && (
              <pre style={{ marginTop: 10, background: '#0b1020', color: '#e5e7eb', padding: 10, borderRadius: 10, overflowX: 'auto' }}>{r.rawText}</pre>
            )}
            {(r.actions && r.actions.length > 0) && (
              <pre style={{ marginTop: 10, background: '#0b1020', color: '#e5e7eb', padding: 10, borderRadius: 10, overflowX: 'auto' }}>{JSON.stringify(r.actions, null, 2)}</pre>
            )}
            {r.result != null && (
              <pre style={{ marginTop: 10, background: '#0b1020', color: '#e5e7eb', padding: 10, borderRadius: 10, overflowX: 'auto' }}>{JSON.stringify(r.result, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
