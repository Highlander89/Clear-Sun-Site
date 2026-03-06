import { NextResponse } from 'next/server';
import { getSheets, parseNum } from '@/app/lib/sheets';
import fs from 'fs';

const ALERT_STATE_FILE = '/home/ubuntu/clearsun-wa/.alert-state.json';

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  const cached = cache.get('alerts');
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }
  try {
    const { sheets, SHEET_ID } = getSheets();
    const [svcData, fuelData] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Services!A4:F30' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!F47' }),
    ]);
    const serviceAlerts = (svcData.data.values || [])
      .filter(r => r[0])
      .map(r => {
        const machineName = r[0].trim();
        const hoursToService = parseNum(r[5]);
        if (hoursToService === null) return null;
        if (hoursToService <= 0) return { type: 'service', machine: machineName, hoursToService, severity: 'critical', message: `${machineName} is overdue by ${Math.abs(hoursToService).toFixed(0)}h` };
        if (hoursToService <= 50) return { type: 'service', machine: machineName, hoursToService, severity: 'warning', message: `${machineName} due in ${hoursToService.toFixed(0)}h` };
        return null;
      }).filter(Boolean);
    const stock = parseNum(fuelData.data.values?.[0]?.[0]);
    const fuelAlerts = stock !== null && stock < 20000
      ? [{ type: 'fuel', severity: 'critical', message: `Low fuel: ${stock.toLocaleString('en-ZA')}L remaining`, stockOnHand: stock }]
      : [];
    
    let lastServiceAlertSent = null;
    try {
      const alertState = JSON.parse(fs.readFileSync(ALERT_STATE_FILE, 'utf8'));
      lastServiceAlertSent = alertState.lastServiceAlertSent || null;
    } catch {}
    
    const result = { serviceAlerts, fuelAlerts, totalCount: serviceAlerts.length + fuelAlerts.length, lastServiceAlertSent };
    cache.set('alerts', { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
