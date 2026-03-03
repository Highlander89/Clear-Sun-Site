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

    return NextResponse.json({ botStatus, uptimeSeconds, lastMessageTs, queueDepth });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
