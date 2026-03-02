import { google } from 'googleapis';
import fs from 'fs';

const SHEET_ID = process.env.SHEET_ID!;

export function getSheets() {
  const tokens = JSON.parse(fs.readFileSync('/home/ubuntu/.openclaw/workspace/scripts/clearsun/token.json','utf8'));
  const secret = JSON.parse(fs.readFileSync('/home/ubuntu/.openclaw/workspace/scripts/clearsun/client_secret.json','utf8'));
  const creds = secret.installed || secret.web;
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret, creds.redirect_uris[0]);
  auth.setCredentials(tokens);
  return { sheets: google.sheets({ version: 'v4', auth }), SHEET_ID };
}

export const TAB_MAP: Record<string, string> = {
  SCRN002: 'Finlay Screen - Scrn002', DOZ001: 'DOZ 001', BULLD12: 'BULLD 12',
  FEL001: 'RB Loader RB856 - FEL 001', FEL002: 'RB Loader ZL60 - FEL 002',
  FEL003: 'Bell Loader - FEL 003', FEL004: 'RB Loader RB856 - FEL 004',
  FEL005: 'RB Loader RB856 - FEL 005', ADT001: 'Bell B20 ADT 001',
  ADT002: 'RBullD CMT96 - ADT 002', ADT003: 'ADT003',
  ADT004: 'Bell B40 - ADT 004', ADT005: 'RB CMT96 - ADT 005',
  ADT006: 'Powerstar 4035 - ADT 006', EXC001: 'Hyundai - EX 001',
  EXC002: 'RB - EX 002', EXC003: 'Volvo - EX 003',
  EXC004: 'RB - EX 004', EXC005: 'RB - EX 005',
  GEN001: 'Gen - 001 SCREEN', GEN002: 'Gen - 002', GEN003: 'Gen - 003',
  GEN004: 'RP Gen - 004', GEN005: 'Gen - 005 PLANT', ROLLERCH: 'Roller CH',
};

export const ADT_PAYLOADS: Record<string, number> = {
  ADT001: 20, ADT002: 55, ADT003: 40, ADT004: 40, ADT005: 55, ADT006: 40,
};

export const ADT_MACHINES = new Set(['ADT001','ADT002','ADT003','ADT004','ADT005','ADT006']);

export function getTodayRow(): number {
  // Get current day in SAST (Africa/Johannesburg UTC+2)
  const now = new Date();
  const saDay = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }));
  return saDay.getDate() + 3;
}

export function parseNum(val: string | undefined | null): number | null {
  if (!val || val.trim() === '' || val.trim() === '-') return null;
  const n = parseFloat(val.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}
