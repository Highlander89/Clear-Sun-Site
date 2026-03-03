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

type ServiceRow = {
  machineName: string;
  lastServiceDate: string;
  hoursAtService: number | null;
  nextDueHours: number | null;
  currentHours: number | null;
  hoursToService: number | null;
  serviceInterval: number;
};

export default function ExceptionsPage() {
  const [data, setData] = useState<{ count: number; items: PendingItem[] } | null>(null);
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/exceptions', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'failed');
        setData(j);

        const rs = await fetch('/api/services', { cache: 'no-store' });
        const js = await rs.json();
        if (!rs.ok) throw new Error(js?.error || 'failed');
        setServices(js);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    };

    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const badServices = (services || []).filter((r) => {
    const nextBehind = r.nextDueHours != null && r.currentHours != null && r.nextDueHours < r.currentHours;
    const negative = r.hoursToService != null && r.hoursToService < 0;
    return nextBehind || negative;
  });

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Exceptions</h1>

      <h2 style={{ marginTop: 24, fontSize: 22, fontWeight: 700 }}>Pending Confirmations</h2>
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
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                    <code>{it.id}</code>
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{it.type}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{it.op}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{String(it.value ?? '')}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                    <code>{it.range || ''}</code>
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                    {it.createdAtMs ? new Date(it.createdAtMs).toLocaleString() : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 style={{ marginTop: 32, fontSize: 22, fontWeight: 700 }}>Service Sheet Anomalies</h2>
      <p style={{ opacity: 0.8 }}>
        Flags rows where <b>Next Service Hours</b> is behind <b>Current Hours</b>, or <b>Hours To Service</b> is negative.
      </p>

      {!services && !err && <div>Loading services…</div>}

      {services && badServices.length === 0 && <div style={{ opacity: 0.8 }}>No anomalies detected.</div>}

      {services && badServices.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['machine', 'last serviced', 'hours@service', 'next due', 'current', 'hours to service'].map((h) => (
                <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {badServices.map((r) => (
              <tr key={r.machineName}>
                <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{r.machineName}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{r.lastServiceDate}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{String(r.hoursAtService ?? '')}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{String(r.nextDueHours ?? '')}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{String(r.currentHours ?? '')}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0', color: (r.hoursToService ?? 0) < 0 ? 'crimson' : undefined }}>
                  {String(r.hoursToService ?? '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
