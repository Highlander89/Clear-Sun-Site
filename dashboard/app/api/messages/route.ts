import { NextResponse } from 'next/server';
import fs from 'fs';

const JSONL = '/home/ubuntu/clearsun-wa/enriched-messages.jsonl';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 1000);

    const raw = fs.readFileSync(JSONL, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const slice = lines.slice(-limit).reverse();

    const messages = slice
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);

    // Return a stable shape for the UI
    return NextResponse.json({ messages, count: messages.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
