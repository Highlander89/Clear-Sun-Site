import { NextResponse } from 'next/server';
import { getSheets, parseNum } from '@/app/lib/sheets';

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  const cached = cache.get('fuel');
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }
  try {
    const { sheets, SHEET_ID } = getSheets();
    const [summary, price, dips] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!C47:F47' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!K2' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!B48:C60' }),
    ]);
    const s = summary.data.values?.[0] || [];
    const openingStock = parseNum(s[0]);
    const litresRefuelled = parseNum(s[1]);
    const litresUsed = parseNum(s[2]);
    const stockOnHand = parseNum(s[3]);
    const pricePerLitre = parseNum(price.data.values?.[0]?.[0]);
    const dipHistory = (dips.data.values || [])
      .filter(r => r[0] && r[1])
      .map(r => ({ date: r[0], litres: parseNum(r[1]) }));
    const dailyBurn = litresUsed && dipHistory.length > 1
      ? litresUsed / Math.max(dipHistory.length, 1) : null;
    const daysRemaining = (stockOnHand && dailyBurn && dailyBurn > 0) ? Math.floor(stockOnHand / dailyBurn) : null;
    const result = { openingStock, litresRefuelled, litresUsed, stockOnHand, pricePerLitre, dipHistory, dailyBurn, daysRemaining };
    cache.set('fuel', { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
