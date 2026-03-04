import { NextResponse } from 'next/server';
import { getSheets } from '@/app/lib/sheets';

// Minimal server-side correction endpoint for operators.
// This writes both: (1) target cell, (2) an audit entry in RawData.

type Body = {
  kind: 'diesel' | 'hours' | 'loads_quarry' | 'loads_screen' | 'loads_tailings' | 'service_last' | 'service_next';
  machineCode: string;
  dayRow: number; // e.g. 7
  value: number;
  note?: string;
};

const SHEET_ID_DEFAULT = '1yd_Zd2akUwSNoN0pHH0qLsmAT7Mxg7Nw81qYIulD-W4';

const TAB_MAP: Record<string, string> = {
  SCRN002: 'Finlay Screen - Scrn002', DOZ001: 'DOZ 001', BULLD12: 'BULLD 12',
  FEL001: 'RB Loader RB856 - FEL 001', FEL002: 'RB Loader ZL60 - FEL 002',
  FEL003: 'Bell Loader - FEL 003', FEL004: 'RB Loader RB856 - FEL 004',
  FEL005: 'RB Loader RB856 - FEL 005', ADT001: 'Bell B20 ADT 001',
  ADT002: 'RBullD CMT96 - ADT 002', ADT003: 'ADT003', ADT004: 'Bell B40 - ADT 004',
  ADT005: 'RB CMT96 - ADT 005', ADT006: 'Powerstar 4035 - ADT 006',
  EXC001: 'Hyundai - EX 001', EXC002: 'RB - EX 002', EXC003: 'Volvo - EX 003',
  EXC004: 'RB - EX 004', EXC005: 'RB - EX 005', GEN001: 'Gen - 001 SCREEN',
  GEN002: 'Gen - 002', GEN003: 'Gen - 003', GEN004: 'RP Gen - 004',
  GEN005: 'Gen - 005 PLANT',
};

const SVC_ROW: Record<string, number> = {
  SCRN002: 4, DOZ001: 5, BULLD12: 6,
  FEL001: 7, FEL002: 8, FEL003: 9, FEL004: 10, FEL005: 11,
  ADT001: 12, ADT002: 13, ADT003: 14, ADT004: 15, ADT005: 16, ADT006: 17,
  EXC001: 18, EXC002: 19, EXC003: 20, EXC004: 21, EXC005: 22,
  GEN001: 23, GEN002: 24, GEN003: 25, GEN004: 26, GEN005: 27,
};

function cellFor(kind: Body['kind'], dayRow: number, machineCode: string) {
  if (kind === 'diesel') return { tab: TAB_MAP[machineCode], cell: `F${dayRow}` };
  if (kind === 'hours') return { tab: TAB_MAP[machineCode], cell: `D${dayRow}` };
  if (kind === 'loads_quarry') return { tab: TAB_MAP[machineCode], cell: `H${dayRow}` };
  if (kind === 'loads_screen') return { tab: TAB_MAP[machineCode], cell: `J${dayRow}` };
  if (kind === 'loads_tailings') return { tab: TAB_MAP[machineCode], cell: `K${dayRow}` };
  if (kind === 'service_last') return { tab: 'Services', cell: `C${SVC_ROW[machineCode]}` };
  if (kind === 'service_next') return { tab: 'Services', cell: `D${SVC_ROW[machineCode]}` };
  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.kind || !body.machineCode || typeof body.dayRow !== 'number') {
      return NextResponse.json({ ok: false, error: 'missing fields' }, { status: 400 });
    }
    const { sheets, SHEET_ID } = getSheets();
    const sheetId = SHEET_ID || SHEET_ID_DEFAULT;

    const target = cellFor(body.kind, body.dayRow, body.machineCode);
    if (!target?.tab || !target?.cell) {
      return NextResponse.json({ ok: false, error: 'unknown machineCode or kind' }, { status: 400 });
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${target.tab}'!${target.cell}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[body.value]] },
    });

    // Audit to RawData (append a system correction row)
    const nowIso = new Date().toISOString();
    const auditText = `CORRECTION (${body.kind}) ${body.machineCode} -> ${body.value}${body.note ? ' | ' + body.note : ''}`;
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'RawData!A:G',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[nowIso, 'system', 'dashboard', auditText, '', '', auditText]] },
    });

    return NextResponse.json({ ok: true, tab: target.tab, cell: target.cell });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
