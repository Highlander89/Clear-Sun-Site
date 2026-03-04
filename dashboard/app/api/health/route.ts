import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';

export async function GET() {
  try {
    let botStatus = 'offline';
    let uptimeSeconds = 0;
    try {
      const pm2 = JSON.parse(execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8' }));
      const bot = pm2.find((p: { name: string }) => p.name === 'clearsun-wa');
      if (bot) {
        botStatus = bot.pm2_env?.status === 'online' ? 'online' : 'offline';
        uptimeSeconds = bot.pm2_env?.pm_uptime ? Math.floor((Date.now() - bot.pm2_env.pm_uptime) / 1000) : 0;
      }
    } catch { /* pm2 unavailable */ }

    let lastMessageTs = null;
    let queueDepth = 0;
    try {
      const lines = fs.readFileSync('/home/ubuntu/clearsun-wa/enriched-messages.jsonl', 'utf8').trim().split('\n');
      const last = JSON.parse(lines[lines.length - 1]);
      lastMessageTs = last.ts;
    } catch { /* ok */ }
    try {
      const q = fs.readFileSync('/home/ubuntu/clearsun-wa/queue.jsonl', 'utf8').trim().split('\n').filter(Boolean);
      queueDepth = q.length;
    } catch { /* ok */ }

    // Idempotency ledger stats (for exactly-once writes)
    // NOTE: do not `require()` absolute paths (Next/Turbopack tries to bundle them).
    // Read the ledger JSON directly from disk instead.
    let idempotencyLedger: { total: number; valid: number; expired: number; lastUpdated: string | null } = {
      total: 0,
      valid: 0,
      expired: 0,
      lastUpdated: null,
    };
    try {
      const p = '/home/ubuntu/clearsun-wa/.idempotency-ledger.json';
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      const entries = j.entries || {};
      const now = Date.now();
      const ttlMs = 7 * 24 * 60 * 60 * 1000;
      let valid = 0;
      let expired = 0;
      for (const k of Object.keys(entries)) {
        const ts = entries[k]?.ts;
        if (ts && (now - ts <= ttlMs)) valid++;
        else expired++;
      }
      idempotencyLedger = {
        total: Object.keys(entries).length,
        valid,
        expired,
        lastUpdated: j.updatedAt || null,
      };
    } catch { /* keep zeros */ }

    return NextResponse.json({ botStatus, uptimeSeconds, lastMessageTs, queueDepth, idempotencyLedger });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
