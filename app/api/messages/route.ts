import { NextResponse } from 'next/server';
import fs from 'fs';

const JSONL = '/home/ubuntu/clearsun-wa/enriched-messages.jsonl';

export async function GET() {
  try {
    const raw = fs.readFileSync(JSONL, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const last200 = lines.slice(-200).reverse();
    const messages = last200.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    return NextResponse.json(messages);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
