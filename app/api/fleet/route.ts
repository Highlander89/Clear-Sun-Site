import { NextResponse } from 'next/server';
import { getSheets, TAB_MAP, ADT_MACHINES, ADT_PAYLOADS, getTodayRow, parseNum } from '@/app/lib/sheets';

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 4 * 60 * 1000;

export async function GET() {
  const cached = cache.get('fleet');
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }
  try {
    const { sheets, SHEET_ID } = getSheets();
    const row = getTodayRow();
    const machines = Object.entries(TAB_MAP);
    const results = await Promise.allSettled(
      machines.map(async ([code, tabName]) => {
        const isADT = ADT_MACHINES.has(code);
        const range = isADT ? `'${tabName}'!C${row}:K${row}` : `'${tabName}'!C${row}:F${row}`;
        try {
          const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
          const vals = r.data.values?.[0] || [];
          const startHours = parseNum(vals[0]);
          const stopHours = parseNum(vals[1]);
          const hoursWorked = (startHours != null && stopHours != null) ? Math.max(0, stopHours - startHours) : null;
          const dieselLitres = parseNum(vals[3]);
          const base = { code, tabName, row, startHours, stopHours, hoursWorked, dieselLitres, isADT };
          if (isADT) {
            const quarryLoads = parseNum(vals[5]);
            const screenLoads = parseNum(vals[7]);
            const tailingsLoads = parseNum(vals[8]);
            const totalLoads = (quarryLoads||0) + (screenLoads||0) + (tailingsLoads||0);
            const tonsMoved = totalLoads * (ADT_PAYLOADS[code] || 0);
            return { ...base, quarryLoads, screenLoads, tailingsLoads, totalLoads, tonsMoved, payload: ADT_PAYLOADS[code] };
          }
          return base;
        } catch {
          return { code, tabName, row, startHours: null, stopHours: null, hoursWorked: null, dieselLitres: null, isADT, error: 'Sheet unavailable' };
        }
      })
    );
    const data = results.map(r => r.status === 'fulfilled' ? r.value : { error: 'Failed' });
    cache.set('fleet', { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
