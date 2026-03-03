'use client';

import { useEffect, useState } from 'react';

type PendingItem = {
  id: string;
  type: string;
  op: string;
  range?: string;
  value?: number;
  ts?: string;
  createdAtMs?: number;
};

export default function ExceptionsPage() {
  const [data, setData] = useState<{ count: number; items: PendingItem[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/exceptions', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'failed');
        setData(j);
      } catch (e: unknown) {
        setErr((e instanceof Error ? e.message : String(e)));
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Exceptions (Pending Confirmations)</h1>
      <p style={{ opacity: 0.8 }}>
        These are out-of-range values the bot did <b>not</b> write automatically. Reply in WhatsApp with <code>OK &lt;id&gt;</code> or{' '}
        <code>CORRECT &lt;id&gt; &lt;value&gt;</code>.
      </p>

      {err && <pre style={{ color: 'crimson' }}>{err}</pre>}
      {!data && !err && <div>Loading…</div>}

      {data && (
        <>
          <div style={{ margin: '12px 0' }}>
            <b>Pending:</b> {data.count}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['id', 'type', 'op', 'value', 'range', 'created'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id}>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}><code>{it.id}</code></td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{it.type}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{it.op}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{String(it.value ?? '')}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}><code>{it.range || ''}</code></td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{it.createdAtMs ? new Date(it.createdAtMs).toLocaleString() : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
