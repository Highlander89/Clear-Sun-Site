import { NextResponse } from 'next/server';
import { getSheets } from '@/app/lib/sheets';

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const cached = cache.get('services');
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }
  try {
    const { sheets, SHEET_ID } = getSheets();
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Services!A4:F30' });
    const rows = r.data.values || [];
    const data = rows.map((row) => {
      const machineName = (row[0] || '').trim();
      const lastServiceDate = (row[1] || '').trim();
      const hoursAtService = row[2] ? parseFloat(row[2].replace(/[^0-9.-]/g, '')) : null;
      const nextDueHours = row[3] ? parseFloat(row[3].replace(/[^0-9.-]/g, '')) : null;
      const currentHours = row[4] ? parseFloat(row[4].replace(/[^0-9.-]/g, '')) : null;
      const hoursToService = row[5] ? parseFloat(row[5].replace(/[^0-9.-]/g, '')) : null;
      const serviceInterval = machineName.toUpperCase().includes('BULLD 12') ? 500 : 250;
      return {
        machineName,
        lastServiceDate,
        hoursAtService: isNaN(hoursAtService as number) ? null : hoursAtService,
        nextDueHours: isNaN(nextDueHours as number) ? null : nextDueHours,
        currentHours: isNaN(currentHours as number) ? null : currentHours,
        hoursToService: isNaN(hoursToService as number) ? null : hoursToService,
        serviceInterval,
      };
    }).filter(r => r.machineName);
    cache.set('services', { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
