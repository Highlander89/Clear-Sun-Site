import { NextResponse } from 'next/server';
import fs from 'fs';

const AUDIT_FILE = '/home/ubuntu/clearsun-wa/audit-decisions.jsonl';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('limit') || '200', 10)));

    if (!fs.existsSync(AUDIT_FILE)) {
      return NextResponse.json({ rows: [] });
    }

    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean);
    const slice = lines.slice(-limit);
    const rows = slice.map((l) => {
      try { return JSON.parse(l); } catch { return { ts: new Date().toISOString(), kind: 'bad_line', raw: l }; }
    }).reverse();

    return NextResponse.json({ rows });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
