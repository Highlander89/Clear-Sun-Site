import { NextResponse } from 'next/server';
import { getSheets } from '@/app/lib/sheets';

export async function GET() {
  try {
    const { sheets, SHEET_ID } = getSheets();
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Services!A4:F30' });
    const rows = r.data.values || [];
    const data = rows.map((row) => {
      const machineName = (row[0] || '').trim();
      const hoursToService = row[5] ? parseFloat(row[5].replace(/[^0-9.-]/g, '')) : null;
      const serviceInterval = machineName.includes('BULLD 12') ? 500 : 250;
      return { machineName, hoursToService: isNaN(hoursToService as number) ? null : hoursToService, serviceInterval };
    }).filter(r => r.machineName);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
