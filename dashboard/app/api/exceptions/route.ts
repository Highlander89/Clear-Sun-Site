import { NextResponse } from 'next/server';
import fs from 'fs';

// Exceptions = pending confirmations (out-of-range values awaiting OK/CORRECT)
const PENDING_PATH = '/home/ubuntu/clearsun-wa/.pending-confirm.json';

type PendingItem = {
  id?: string;
  type?: string;
  op?: string;
  range?: string;
  value?: number;
  ts?: string;
  createdAtMs?: number;
};

type PendingFile = {
  items?: PendingItem[];
};

export async function GET() {
  try {
    let pending: PendingFile = { items: [] };
    try {
      const raw = fs.readFileSync(PENDING_PATH, 'utf8');
      const parsed = JSON.parse(raw) as PendingFile;
      pending = parsed && typeof parsed === 'object' ? parsed : { items: [] };
    } catch {
      pending = { items: [] };
    }

    const items = Array.isArray(pending.items) ? pending.items : [];
    items.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

    return NextResponse.json({
      count: items.length,
      items: items.slice(0, 200),
      note: 'Pending confirmations expire after 2 hours if not OK/CORRECTed.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
