import { NextResponse } from 'next/server';
import { getSheets, TAB_MAP, ADT_MACHINES, ADT_PAYLOADS, parseNum } from '@/app/lib/sheets';

export async function GET() {
  try {
    const { sheets, SHEET_ID } = getSheets();
    const psData = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!B5:L28' });
    const rows = psData.data.values || [];
    const adtLoads = rows.filter(r => {
      const name = (r[0]||'').trim();
      return Object.entries(TAB_MAP).some(([code, tab]) => ADT_MACHINES.has(code) && tab === name);
    }).map(r => {
      const code = Object.entries(TAB_MAP).find(([c, t]) => ADT_MACHINES.has(c) && t === r[0]?.trim())?.[0] || '';
      const quarryLoads = parseNum(r[6]);
      const screenLoads = parseNum(r[8]);
      const tailingsLoads = parseNum(r[9]);
      const totalLoads = (quarryLoads||0) + (screenLoads||0) + (tailingsLoads||0);
      return { code, tabName: r[0]?.trim(), quarryLoads, screenLoads, tailingsLoads, totalLoads, tonsMoved: totalLoads * (ADT_PAYLOADS[code]||0) };
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
    return NextResponse.json({
      adtLoads,
      machineHours: machineHours.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
