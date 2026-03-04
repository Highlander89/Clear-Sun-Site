'use client';

import { useEffect, useState } from 'react';

type OpResult = { ok: boolean; message: string; data?: unknown };

type Health = {
  botStatus: string;
  uptimeSeconds: number;
  lastMessageTs: string | null;
  queueDepth: number;
  idempotencyLedger?: { total: number; valid: number; expired: number; lastUpdated: string | null };
};

export default function OperatorPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<OpResult | null>(null);

  async function refresh() {
    const r = await fetch('/api/health', { cache: 'no-store' });
    const j = await r.json();
    setHealth(j);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, []);

  async function run(action: string) {
    setBusy(action);
    setLast(null);
    try {
      const r = await fetch('/api/operator', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      setLast(j);
    } catch (e: unknown) {
      setLast({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      refresh();
    }
  }

  const buttons: Array<{ action: string; label: string; desc: string }> = [
    { action: 'sendAlertNow', label: 'Send 08:00 Alert Now', desc: 'Triggers the daily Service/Fuel alert to the WA group immediately.' },
    { action: 'restartBot', label: 'Restart WhatsApp Bot (safe)', desc: 'PM2 restart clearsun-wa.' },
    { action: 'restartDashboard', label: 'Restart Dashboard', desc: 'PM2 restart clearsun-dashboard.' },
    { action: 'runDriftCheck', label: 'Run Drift-Check', desc: 'Validates that dashboard docs match parser constants.' },
    { action: 'runQaSmoke', label: 'Run QA Smoke', desc: 'Fast sanity check: syntax + health endpoints.' },
    { action: 'postTemplates', label: 'Post Templates to WA Group', desc: 'Posts copy/paste templates (bulk close / diesel / correct) to the WA group.' },
  ];

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Operator Mode</h1>
      <p style={{ opacity: 0.85 }}>
        One-click ops actions. Use this instead of ad-hoc manual fixes.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 18 }}>
        {buttons.map((b) => (
          <div key={b.action} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700 }}>{b.label}</div>
            <div style={{ opacity: 0.8, fontSize: 13, marginTop: 6 }}>{b.desc}</div>
            <button
              style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #111827', background: busy === b.action ? '#111827' : '#fff', color: busy === b.action ? '#fff' : '#111827', cursor: 'pointer' }}
              disabled={!!busy}
              onClick={() => run(b.action)}
            >
              {busy === b.action ? 'Running…' : 'Run'}
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Status</h2>
        <pre style={{ background: '#0b1020', color: '#e5e7eb', padding: 12, borderRadius: 10, overflowX: 'auto' }}>
          {JSON.stringify(health, null, 2)}
        </pre>
      </div>

      {last && (
        <div style={{ marginTop: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Last action result</h2>
          <pre style={{ background: last.ok ? '#052e16' : '#3f1d1d', color: '#e5e7eb', padding: 12, borderRadius: 10, overflowX: 'auto' }}>{JSON.stringify(last, null, 2)}</pre>
        </div>
      )}

      <div style={{ marginTop: 20, opacity: 0.85 }}>
        <a href="/audit">Open Audit Trail →</a>
      </div>
    </div>
  );
}
