import { NextResponse } from 'next/server';
import fs from 'fs';

const JSONL = '/home/ubuntu/clearsun-wa/enriched-messages.jsonl';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 1000);

    const raw = fs.readFileSync(JSONL, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);

    // Parse all lines newest-first, deduplicate by message_id, then take limit
    const allParsed = lines
      .slice()
      .reverse()
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);

    const seen = new Set<string>();
    const deduped = allParsed.filter(m => {
      const key = m.message_id || m.ts + '|' + (m.text || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const messages = deduped.slice(0, limit);

    // Return a stable shape for the UI
    return NextResponse.json({ messages, count: messages.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
