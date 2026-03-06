import { NextResponse } from 'next/server';
import { getSheets, TAB_MAP, ADT_PAYLOADS, parseNum } from '@/app/lib/sheets';

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  const cached = cache.get('production');
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }
  try {
    const { sheets, SHEET_ID } = getSheets();
    const psData = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!B5:L28' });
    const rows = psData.data.values || [];
    // ADT001-ADT006 are at fixed row positions in Production Summary (rows 13-18 = index 8-13)
    // Match by position to avoid name-mismatch issues between TAB_MAP and sheet labels
    const ADT_ORDER = ['ADT001','ADT002','ADT003','ADT004','ADT005','ADT006'];
    const ADT_ROW_OFFSET = 8;
    const adtLoads = ADT_ORDER.map((code, i) => {
      const r = rows[ADT_ROW_OFFSET + i] || [];
      const quarryLoads = parseNum(r[6]);
      const screenLoads = parseNum(r[8]);
      const tailingsLoads = parseNum(r[9]);
      const totalLoads = (quarryLoads||0) + (screenLoads||0) + (tailingsLoads||0);
      return { code, tabName: (r[0]||'').trim() || code, quarryLoads, screenLoads, tailingsLoads, totalLoads, tonsMoved: totalLoads * (ADT_PAYLOADS[code]||0) };
    });
    const machineHours = await Promise.allSettled(
      Object.entries(TAB_MAP).map(async ([code, tabName]) => {
        try {
          const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${tabName}'!E35` });
          const hours = parseNum(r.data.values?.[0]?.[0]);
          return { code, tabName, hoursThisMonth: hours };
        } catch { return { code, tabName, hoursThisMonth: null }; }
      })
    );
    const result = {
      adtLoads,
      machineHours: machineHours.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean),
    };
    cache.set('production', { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
