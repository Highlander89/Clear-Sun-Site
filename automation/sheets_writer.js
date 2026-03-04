// sheets_writer.js — Clearsun WhatsApp → Google Sheets writer
'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { auditLog } = require('./audit_log');
const { AsyncLocalStorage } = require('async_hooks');
const _auditALS = new AsyncLocalStorage();

const SHEET_ID = process.env.SHEET_ID || '1yd_Zd2akUwSNoN0pHH0qLsmAT7Mxg7Nw81qYIulD-W4';
const TOKEN_PATH = '/home/ubuntu/.openclaw/workspace/scripts/clearsun/token.json';
const SECRET_PATH = '/home/ubuntu/.openclaw/workspace/scripts/clearsun/client_secret.json';
const RAWDATA_SCRIPT = '/home/ubuntu/.openclaw/workspace/scripts/clearsun/clearsun_append_rawdata.sh';

const { checkIdempotency, checkAdditiveIdempotency, markIdempotent, markAdditiveIdempotent } = require('./idempotency_ledger');

// Tab map: code → exact sheet tab name
const TAB_MAP = {
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

// Alias map: normalised text → machine code
const ALIASES = {
  'adt001': 'ADT001', 'adt 001': 'ADT001', 'bell 20': 'ADT001', 'bell b20': 'ADT001', 'bellb20': 'ADT001',
  'adt002': 'ADT002', 'adt 002': 'ADT002',
  'adt003': 'ADT003', 'adt 003': 'ADT003', 'bell b40 adt003': 'ADT003',
  'adt004': 'ADT004', 'adt 004': 'ADT004', 'bell 40': 'ADT004', 'bell b40': 'ADT004', 'bellb40': 'ADT004',
  'adt005': 'ADT005', 'adt 005': 'ADT005',
  'adt006': 'ADT006', 'adt 006': 'ADT006', 'powerstar': 'ADT006',
  'exc001': 'EXC001', 'exc 001': 'EXC001', 'ex001': 'EXC001', 'hyundai': 'EXC001',
  'exc002': 'EXC002', 'exc 002': 'EXC002', 'ex002': 'EXC002',
  'exc003': 'EXC003', 'exc 003': 'EXC003', 'ex003': 'EXC003', 'volvo': 'EXC003',
  'exc004': 'EXC004', 'exc 004': 'EXC004', 'ex004': 'EXC004',
  'exc005': 'EXC005', 'exc 005': 'EXC005', 'ex005': 'EXC005',
  'fel001': 'FEL001', 'fel 001': 'FEL001',
  'fel002': 'FEL002', 'fel 002': 'FEL002',
  'fel003': 'FEL003', 'fel 003': 'FEL003', 'bell loader': 'FEL003',
  'fel004': 'FEL004', 'fel 004': 'FEL004',
  'fel005': 'FEL005', 'fel 005': 'FEL005',
  'gen001': 'GEN001', 'gen 001': 'GEN001',
  'gen002': 'GEN002', 'gen 002': 'GEN002',
  'gen003': 'GEN003', 'gen 003': 'GEN003',
  'gen004': 'GEN004', 'gen 004': 'GEN004',
  'gen005': 'GEN005', 'gen 005': 'GEN005',
  'scrn002': 'SCRN002', 'scrn 002': 'SCRN002', 'screen': 'SCRN002', 'finlay': 'SCRN002',
  'doz001': 'DOZ001', 'doz 001': 'DOZ001', 'doz': 'DOZ001', 'dozer': 'DOZ001',
  'bulld12': 'BULLD12', 'bulld 12': 'BULLD12', 'd12': 'BULLD12', 'bulldozer d12': 'BULLD12',
  'bulld001': 'BULLD001_RETIRED', 'bulld 001': 'BULLD001_RETIRED',
};

// Bakkies vehicle → column index (0-based from A)
const BAKKIES_COL = {
  'hilux 2.5': 1, 'hilux2.5': 1, '2.5 hilux': 1,

  // 3.0 Hilux
  'hilux 3l': 2, 'hilux 3.0': 2, 'hilux3l': 2, 'hilux3.0': 2,
  '3l hilux': 2, '3.0 hilux': 2,

  // 2.8 Hilux
  'hilux 2.8': 5, 'hilux2.8': 5, '2,8 hilux': 5, '2.8 hilux': 5,

  'vw bus': 3, 'vwbus': 3, 'vw': 3,
  'hino': 4, 'hino truck': 4,
};

function getSheets() {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const secret = JSON.parse(fs.readFileSync(SECRET_PATH, 'utf8'));
  const creds = secret.installed || secret.web;
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret, creds.redirect_uris[0]);
  auth.setCredentials(tokens);
  return google.sheets({ version: 'v4', auth });
}

function getSASTDateStr(ts) {
  const d = new Date(ts);
  const sast = new Date(d.getTime() + 2 * 3600 * 1000);
  const h = sast.getUTCHours();
  if (h < 5) sast.setUTCDate(sast.getUTCDate() - 1);
  return sast.getUTCDate() + '/' + (sast.getUTCMonth() + 1) + '/' + sast.getUTCFullYear();
}

const { execFile } = require('child_process');

async function appendToRawData(type, machine, field, oldValue, newValue, messageId, conversationId) {
  return new Promise((resolve, reject) => {
    const direction = 'correction';
    const fromName = `${type}:${machine}:${field}`;
    const fromNumber = messageId || '';
    const text = `CORRECTION|${machine}|${field}|${oldValue || ''}|${newValue}|${getSASTDateStr(new Date().toISOString())}`;
    const convId = conversationId || '';

    execFile(RAWDATA_SCRIPT, [direction, fromName, fromNumber, text, convId], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        console.log('[sheets_writer] RawData append failed: ' + err.message + ' ' + (stderr || ''));
        return reject(err);
      }
      if (stdout) console.log('[sheets_writer] RawData append: ' + stdout.trim());
      return resolve(true);
    });
  });
}

async function appendInvalidBulkClose(rawText, errorReason, messageId, conversationId) {
  return new Promise((resolve, reject) => {
    const direction = 'invalid_bulk';
    const fromName = 'BULK_CLOSE_VALIDATION_FAILED';
    const fromNumber = messageId || '';
    const text = `INVALID_BULK|${errorReason}|${(rawText || '').slice(0, 500)}`;
    const convId = conversationId || '';

    execFile(RAWDATA_SCRIPT, [direction, fromName, fromNumber, text, convId], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        console.log('[sheets_writer] Invalid bulk close append failed: ' + err.message);
        return reject(err);
      }
      if (stdout) console.log('[sheets_writer] Invalid bulk close logged: ' + stdout.trim());
      return resolve(true);
    });
  });
}

function getSASTDate(ts) {
  // ts = ISO string or Date
  const d = new Date(ts);
  // SAST = UTC+2
  const sast = new Date(d.getTime() + 2 * 3600 * 1000);
  const h = sast.getUTCHours();
  // After midnight before 5am → previous day
  if (h < 5) sast.setUTCDate(sast.getUTCDate() - 1);
  return sast;
}

// ── Sheets write hardening (quota + bursts) ────────────────────────────────
// Google Sheets can throw: "Write requests per minute per user".
// We proactively throttle writes and retry with exponential backoff + jitter.
const SHEETS_WRITE_LIMIT_PER_MIN = parseInt(process.env.SHEETS_WRITE_LIMIT_PER_MIN || '50', 10);
let _sheetsWriteTimestamps = [];

function _isRetryableSheetsError(e) {
  const msg = (e && (e.message || e.toString())) || '';
  const code = e?.code || e?.response?.status;
  return (
    code === 429 ||
    code === 500 ||
    code === 502 ||
    code === 503 ||
    code === 504 ||
    /quota/i.test(msg) ||
    /rate limit/i.test(msg) ||
    /Write requests per minute/i.test(msg)
  );
}

async function _throttleSheetsWrite() {
  if (!SHEETS_WRITE_LIMIT_PER_MIN || SHEETS_WRITE_LIMIT_PER_MIN <= 0) return;
  const now = Date.now();
  _sheetsWriteTimestamps = _sheetsWriteTimestamps.filter(t => (now - t) < 60_000);
  if (_sheetsWriteTimestamps.length < SHEETS_WRITE_LIMIT_PER_MIN) return;
  const oldest = _sheetsWriteTimestamps[0];
  const waitMs = Math.max(0, (oldest + 60_000) - now) + Math.floor(Math.random() * 500);
  await new Promise(r => setTimeout(r, waitMs));
}

async function sheetsWriteCall(label, fn) {
  const maxAttempts = parseInt(process.env.SHEETS_WRITE_MAX_ATTEMPTS || '6', 10);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await _throttleSheetsWrite();
    _sheetsWriteTimestamps.push(Date.now());
    try {
      return await fn();
    } catch (e) {
      const retryable = _isRetryableSheetsError(e);
      if (!retryable || attempt == maxAttempts) throw e;
      const base = Math.min(30_000, 500 * Math.pow(2, attempt - 1));
      const jitter = Math.floor(Math.random() * 500);
      const waitMs = base + jitter;
      console.log('[sheets_writer] RETRY ' + attempt + '/' + maxAttempts + ' (' + waitMs + 'ms) label=' + label + ' err=' + (e?.message || e));
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

async function valuesUpdate(sheets, params, label) {
  const store = _auditALS.getStore();
  const range = params?.range;
  const values = params?.requestBody?.values;
  const valueInputOption = params?.valueInputOption;

  // Record intent (even for non-machine writes like Services/Production Summary)
  if (store?.actions && range) {
    store.actions.push({
      kind: 'values.update',
      range,
      values,
      valueInputOption,
      label: label || null,
    });
  }

  return sheetsWriteCall(label || range || 'values.update', () => sheets.spreadsheets.values.update(params));
}

function dayRow(sast) {
  return 3 + sast.getUTCDate(); // day 1 → row 4
}

function resolveMachine(text) {
  const norm = text.toLowerCase().trim();
  // Try direct alias match
  for (const [alias, code] of Object.entries(ALIASES)) {
    if (norm.includes(alias)) return code;
  }
  return null;
}

async function readCell(sheets, tab, cell) {
  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "'" + tab + "'!" + cell,
    });
    return r.data.values?.[0]?.[0] ?? null;
  } catch(e) { return null; }
}

async function writeCell(sheets, tab, cell, value, options = {}) {
  const { skipIdempotency = false, opType, machine, dateStr, why } = options;
  const store = _auditALS.getStore();
  
  if (!skipIdempotency && opType && machine && dateStr) {
    const check = checkIdempotency(opType, machine, dateStr, cell);
    if (check.alreadyWritten && String(check.existingValue) === String(value)) {
      console.log('[sheets_writer] SKIP (idempotent) ' + tab + '!' + cell + ' = ' + value);
    if (store?.actions) store.actions.push({ kind: 'writeCell', range: tab + '!' + cell, value, opType, machine, dateStr, written: false, reason: 'idempotent', why: why || null });
      return false;
    }
  }

  const existing = await readCell(sheets, tab, cell);
  if (existing !== null && existing !== '' && String(existing) === String(value)) {
    console.log('[sheets_writer] SKIP (dupe) ' + tab + '!' + cell + ' = ' + value);
    if (store?.actions) store.actions.push({ kind: 'writeCell', range: tab + '!' + cell, value, opType, machine, dateStr, written: false, reason: 'dupe', oldValue: existing, why: why || null });
    if (!skipIdempotency && opType && machine && dateStr) {
      markIdempotent(opType, machine, dateStr, cell, value);
    }
    return false;
  }
  
  const oldValue = existing;
  await valuesUpdate(sheets, {
    spreadsheetId: SHEET_ID,
    range: "'" + tab + "'!" + cell,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
  console.log('[sheets_writer] WRITE ' + tab + '!' + cell + ' = ' + value);
  if (store?.actions) store.actions.push({ kind: 'writeCell', range: tab + '!' + cell, value, opType, machine, dateStr, written: true, oldValue, why: why || null });
  
  if (!skipIdempotency && opType && machine && dateStr) {
    markIdempotent(opType, machine, dateStr, cell, value);
  }
  
  return { written: true, oldValue };
}

function colLetter(idx) {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
}


// ── SERVICES SHEET HELPERS ─────────────────────────────────────────────────
let _servicesHeaderCache = { date: null };

function formatServicesHeaderDate(sast) {
  // match existing sheet style: "3 Mar 2026"
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${sast.getUTCDate()} ${months[sast.getUTCMonth()]} ${sast.getUTCFullYear()}`;
}

async function ensureServicesHeaderDate(sheets, sast) {
  try {
    const want = formatServicesHeaderDate(sast);
    if (_servicesHeaderCache.date === want) return;
    // Column E is the daily "current hours" column header.
    const cur = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Services!E1' });
    const have = (cur.data.values?.[0]?.[0] || '').toString().trim();
    if (have !== want) {
      await valuesUpdate(sheets, {
        spreadsheetId: SHEET_ID,
        range: 'Services!E1',
        valueInputOption: 'RAW',
        requestBody: { values: [[want]] }
      });
      console.log('[sheets_writer] Services!E1 header updated: ' + have + ' -> ' + want);
    }
    _servicesHeaderCache.date = want;
  } catch (e) {
    console.log('[sheets_writer] Services header update failed: ' + (e?.message || e));
  }
}

// ── PARSERS ──────────────────────────────────────────────────────────────────

// ── DATA QUALITY LAYER (normalization) ─────────────────────────────────────
// Goal: make human formatting variations safe (spaces/commas in thousands, machine code spacing).
function normalizeInputText(raw) {
  if (!raw) return raw;

  // IMPORTANT: preserve newlines for bulk closing messages.
  const lines = String(raw).replace(/\u00A0/g, ' ').split(/\n/);

  const normLine = (t) => {
    // machine codes: GEN005 / gen-5 / GEN 5 => GEN 005
    t = t.replace(/\b(gen|fel|exc|adt|scrn|doz)\s*[- ]?0*(\d{1,3})\b/gi, (_, p, n) => p.toUpperCase() + ' ' + String(n).padStart(3, '0'));
    // bulld variants
    t = t.replace(/\b(bulld)\s*[- ]?0*(\d{1,3})\b/gi, (_, p, n) => p.toUpperCase() + ' ' + String(n).padStart(2, '0'));
    // thousands separators: 42 500 / 42,500 => 42500 (do NOT touch leading-zero groups like 001 235)
    t = t.replace(/\b([1-9]\d{0,2})(?:[ ,](\d{3}))+\b/g, (m) => m.replace(/[ ,]/g, ''));
    // collapse repeated spaces (within a line)
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  };

  return lines.map(normLine).join('\n').trim();
}

// ── DATA QUALITY LAYER (confirmations + sanity) ───────────────────────────
// Only triggers when values look suspicious (out of expected range).
const PENDING_CONFIRM_FILE = path.join(__dirname, '.pending-confirm.json');

function loadPending() {
  try { return JSON.parse(fs.readFileSync(PENDING_CONFIRM_FILE, 'utf8')); } catch { return { items: [] }; }
}
function savePending(state) {
  try { fs.writeFileSync(PENDING_CONFIRM_FILE, JSON.stringify(state, null, 2)); } catch (e) {}
}
function purgePending(state) {
  const now = Date.now();
  state.items = (state.items || []).filter(it => now - (it.createdAtMs || 0) < 2 * 60 * 60 * 1000);
  return state;
}
function makeConfirmId(obj) {
  const crypto = require('crypto');
  const s = JSON.stringify({ t: obj.type, r: obj.range, v: obj.value, op: obj.op, tab: obj.tab, cell: obj.cell, d: obj.dateStr });
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
}
function needsConfirm(type, value) {
  if (value == null || Number.isNaN(value)) return false;
  if (type === 'fuel_price') return (value < 10 || value > 40);
  if (type === 'diesel_dip') return (value < 500 || value > 200000);
  if (type === 'diesel_issue') return (value < 5 || value > 2000);
  return false;
}

async function applyPendingItem(item, sheets, overrideValue, options = {}) {
  const { messageId, conversationId } = options;
  const val = overrideValue != null ? overrideValue : item.value;
  const dateStr = getSASTDateStr(item.ts || new Date().toISOString());
  
  if (item.op === 'set') {
    let oldValue = null;
    try {
      const cur = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: item.range });
      oldValue = cur.data.values?.[0]?.[0] ?? null;
    } catch(e) {}
    
    await valuesUpdate(sheets, {
      spreadsheetId: SHEET_ID,
      range: item.range,
      valueInputOption: 'RAW',
      requestBody: { values: [[val]] },
    }, item.range);
    
    if (item.type === 'fuel_price') {
      await appendToRawData('CORRECTION', 'FuelPrice', 'K2', oldValue, val, messageId, conversationId);
    }
    // applyPendingItem is invoked from confirmation flow; decisions are already audited by the caller.
    return;
  }
  if (item.op === 'fuel_dip') {
    const sast = getSASTDate(item.ts || new Date().toISOString());
    await applyFuelDip(sheets, sast, val, item.alertFn);
    return;
  }
  if (item.op === 'add') {
    const cur = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: item.range });
    const raw = cur.data.values?.[0]?.[0];
    const curVal = raw == null || raw === '' ? 0 : (parseFloat(String(raw).replace(/[^0-9.-]/g,'')) || 0);
    const total = curVal + val;
    await valuesUpdate(sheets, {
      spreadsheetId: SHEET_ID,
      range: item.range,
      valueInputOption: 'RAW',
      requestBody: { values: [[total]] },
    }, item.range);
    
    if (item.type === 'diesel_issue') {
      const machineMatch = item.range.match(/'([^']+)'!F/);
      const machine = machineMatch ? machineMatch[1] : 'unknown';
      await appendToRawData('CORRECTION', machine, 'diesel', curVal, total, messageId, conversationId);
    }
  }
}

async function handleConfirmationCommands(text, alertFn, sheets, options = {}) {
  const { messageId, conversationId } = options;
  const state = purgePending(loadPending());
  const okM = text.match(/^OK\s+([a-f0-9]{8})$/i);
  const implicitM = text.match(/^(?:no|nope|sorry|correction|correct)\b[\s\S]*?(\d+(?:[.,]\d+)?)\s*(?:litres?|liters?|l)\b/i);
  const corrM1 = text.match(/^CORRECT\s+([a-f0-9]{8})\s+([0-9]+(?:[.,][0-9]+)?)$/i);
  const corrM2 = text.match(/^CORRECT\s+([0-9]+(?:[.,][0-9]+)?)\s+([a-f0-9]{8})$/i);

  if (!okM && !corrM1 && !corrM2 && !implicitM) return false;
  // Implicit correction: e.g. 'No its 235L' (no id)
  if (implicitM) {
    const now = Date.now();
    const recent = (state.items || []).filter(it => it.type === 'diesel_issue' && (now - (it.createdAtMs || 0) < 30 * 60 * 1000));
    if (recent.length === 1) {
      const item = recent[0];
      const override = parseFloat(implicitM[1].replace(',', '.'));
      await applyPendingItem(item, sheets, override, { messageId, conversationId });
      state.items = (state.items || []).filter(it => it.id !== item.id);
      savePending(state);
      if (alertFn) await alertFn('✅ Applied correction: diesel_issue = ' + override + ' (' + item.id + ')');
      return true;
    }
  }

  const id = okM ? okM[1].toLowerCase() : (corrM1 ? corrM1[1].toLowerCase() : corrM2[2].toLowerCase());
  const item = (state.items || []).find(it => it.id === id);
  if (!item) {
    if (alertFn) await alertFn('⚠️ No pending confirmation found for id ' + id);
    return true;
  }
  let override = null;
  if (corrM1) override = parseFloat(corrM1[2].replace(',', '.'));
  if (corrM2) override = parseFloat(corrM2[1].replace(',', '.'));

  await applyPendingItem(item, sheets, override, { messageId, conversationId });
  state.items = (state.items || []).filter(it => it.id !== id);
  savePending(state);

  if (alertFn) {
    const v = override != null ? override : item.value;
    await alertFn('✅ Applied: ' + item.type + ' = ' + v + ' (' + id + ')');
  }
  return true;
}

function parseHours(text) {
  // "ADT003 start 22077 stop 22089" / "FEL003 on 16850 off 16862" / "EXC002 22100-22115"
  const patterns = [
    /start[\s:]+(\d+(?:\.\d+)?)\s+stop[\s:]+(\d+(?:\.\d+)?)/i,
    /\bon[\s:]+(\d+(?:\.\d+)?)\s+off[\s:]+(\d+(?:\.\d+)?)/i,
    /(\d{4,6})\s*[-–]\s*(\d{4,6})/,
    /start[\s:]+(\d+(?:\.\d+)?)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return { start: parseFloat(m[1]), stop: m[2] ? parseFloat(m[2]) : null };
  }
  return null;
}

function parseDieselMachine(text) {
  // Priority: number immediately before L/litres (e.g. "381L", "208 litres")
  // Avoids matching machine code digits like "005" from "EXC005"
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:litres?|liters?|l)/i)
          || text.match(/(?:diesel|fuel)[:\s]+(\d+(?:[.,]\d+)?)/i);
  if (m) {
    const val = parseFloat(m[1].replace(',', '.'));
    if (val > 0) return val;
  }
  return null;
}

function parseDieselBakkies(text) {
  const norm = text.toLowerCase();
  for (const [vehicle, colIdx] of Object.entries(BAKKIES_COL)) {
    if (norm.includes(vehicle)) {
      // Must grab litres, not the engine size (e.g. "3L Hilux 57L" should pick 57, not 3).
      const m = text.match(/(\d{2,}(?:[.,]\d+)?)\s*(?:litres?|liters?|l)\b/i)
              || text.match(/(?:litres?|liters?|l)\s*(\d{2,}(?:[.,]\d+)?)/i)
              || text.match(/(\d{2,})/); // fallback: first 2+ digit number
      if (m) return { colIdx, litres: parseFloat(m[1].replace(',', '.')) };
    }
  }
  return null;
}

function parseLoads(text) {
  const norm = text.toLowerCase();
  let category = null;
  if (norm.includes('quarry') || norm.includes('crush')) category = 'quarry';
  else if (norm.includes('screen') || norm.includes('scrn')) category = 'screen';
  else if (norm.includes('tailing')) category = 'tailings';
  if (!category) return null;
  const m = text.match(/(\d+(?:[.,]5)?)\s*(?:loads?)?/i);
  if (!m) return null;
  const val = parseFloat(m[1].replace(',', '.'));
  return { category, loads: val };
}

function parseFuelDip(text) {
  // Prefer thousands separators ("42 500" or "42,500") over decimal comma
  const mThousands = text.match(/(\d{1,3}(?:[ ,]\d{3})+)(?:\s*(?:l|litres?))?/i);
  if (mThousands) {
    const cleaned = mThousands[1].replace(/[ ,]/g, '');
    const val = parseFloat(cleaned);
    if (val > 0) return val;
  }
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:l|litres?)?/i);
  if (m) {
    const val = parseFloat(m[1].replace(',', '.'));
    if (val > 0) return val;
  }
  return null;
}


async function applyFuelDip(sheets, sast, litres, alertFn) {
  const normDateStr = 'Diesel Dip ' + sast.getUTCDate() + '/' + (sast.getUTCMonth()+1) + '/' + sast.getUTCFullYear();

  // Get previous dip to detect refuel
  const dipHistory = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!B47:C55' });
  const dipRows = (dipHistory.data.values || []).filter(r => r[0] && r[1]);
  const prevDipLitres = dipRows.length > 0 ? parseFloat((dipRows[dipRows.length-1][1]||'0').replace(/[^0-9.-]/g,'')) : null;

  // Find next empty row starting at B48
  const psVals = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!B48:B55' });
  const existingRows = psVals.data.values || [];
  const nextRow = 48 + existingRows.filter(r => r[0]).length;

  await valuesUpdate(sheets, {
    spreadsheetId: SHEET_ID, range: 'Production Summary!B' + nextRow + ':C' + nextRow,
    valueInputOption: 'RAW', requestBody: { values: [[normDateStr, litres]] },
  }, 'Production Summary!B' + nextRow + ':C' + nextRow);

  // Stock on hand: Production Summary!F47 is a *formula* (C47 + D47 - E47).
  // A diesel dip is an observed stock take and should update the *baseline* (C47),
  // NOT overwrite the F47 formula going forward.
  let prevStock = null;
  let f47 = null;
  try {
    const stockR = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Production Summary!F47' });
    f47 = stockR.data.values?.[0]?.[0];
    if (f47 != null && f47 !== '' && !String(f47).trim().startsWith('=')) {
      prevStock = parseFloat(String(f47).replace(/[^0-9.-]/g, ''));
    }
  } catch(e) {}

  // If F47 was accidentally overwritten previously, restore the formula.
  try {
    if (f47 != null && f47 !== '' && !String(f47).trim().startsWith('=')) {
      await valuesUpdate(sheets, {
        spreadsheetId: SHEET_ID,
        range: 'Production Summary!F47',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['=C47 + D47 - E47']] },
      }, 'Production Summary!F47');
      console.log('[sheets_writer] Restored Production Summary!F47 formula (=C47 + D47 - E47)');
    }
  } catch(e) {
    console.log('[sheets_writer] Failed to restore F47 formula: ' + e.message);
  }

  // Update baseline stock take
  await valuesUpdate(sheets, {
    spreadsheetId: SHEET_ID,
    range: 'Production Summary!C47',
    valueInputOption: 'RAW',
    requestBody: { values: [[litres]] },
  }, 'Production Summary!C47');
  console.log('[sheets_writer] STOCK TAKE (dip) written: C47=' + litres);

  const diff = (prevStock == null || Number.isNaN(prevStock)) ? '' : (litres - prevStock);

  if (diff !== '') {
    await valuesUpdate(sheets, {
      spreadsheetId: SHEET_ID, range: 'Production Summary!F' + nextRow,
      valueInputOption: 'RAW', requestBody: { values: [[diff]] },
    }, 'Production Summary!F' + nextRow);
    console.log('[sheets_writer] DIP DIFF logged: F' + nextRow + '=' + diff);
  }

  console.log('[sheets_writer] FUEL DIP: PS B' + nextRow + '=' + normDateStr + ' C' + nextRow + '=' + litres);

  // Refuel detection
  if (prevDipLitres !== null && litres > prevDipLitres) {
    const litresAdded = Math.round(litres - prevDipLitres);
    await valuesUpdate(sheets, {
      spreadsheetId: SHEET_ID, range: 'Production Summary!D47',
      valueInputOption: 'RAW', requestBody: { values: [[litresAdded]] },
    }, 'Production Summary!D47');
    console.log('[sheets_writer] REFUEL detected: +' + litresAdded + 'L written to D47');
    if (alertFn) await alertFn(
      '⛽ *Fuel refill detected* — approximately *' + litresAdded.toLocaleString('en-ZA') + 'L* added to bulk tank.\n\n' +
'Please send the updated fuel price (R/L) so K2 can be amended — this will update all cost calculations automatically.'
    );
  }
}

// ── MAIN EXPORT ──────────────────────────────────────────────────────────────


// ── BULK MULTI-MACHINE MESSAGE PARSER ────────────────────────────────────
// Format: "MACHINE start (stop)" per line, then load sections
async function processBulkMessage(text, sheets, sast) {
  const SHEET_ID = process.env.SHEET_ID || '1yd_Zd2akUwSNoN0qLsmAT7Mxg7Nw81qYIulD-W4';
  const row = 3 + sast.getUTCDate();
  await ensureServicesHeaderDate(sheets, sast);
  const TAB_MAP_BULK = {
    'FEL 001':'RB Loader RB856 - FEL 001','FEL 002':'RB Loader ZL60 - FEL 002',
    'FEL 003':'Bell Loader - FEL 003','FEL 004':'RB Loader RB856 - FEL 004','FEL 005':'RB Loader RB856 - FEL 005',
    'ADT 001':'Bell B20 ADT 001','ADT 002':'RBullD CMT96 - ADT 002','ADT 003':'ADT003',
    'ADT 004':'Bell B40 - ADT 004','ADT 005':'RB CMT96 - ADT 005','ADT 006':'Powerstar 4035 - ADT 006',
    'EXC 001':'Hyundai - EX 001','EXC 002':'RB - EX 002','EXC 003':'Volvo - EX 003',
    'EXC 004':'RB - EX 004','EXC 005':'RB - EX 005',
    'GEN 001':'Gen - 001 SCREEN','GEN 002':'Gen - 002','GEN 003':'Gen - 003',
    'GEN 004':'RP Gen - 004','GEN 005':'Gen - 005 PLANT',
    'SCRN 002':'Finlay Screen - Scrn002','BULLD 12':'BULLD 12','BULLD 001':'DOZ 001',
  };
  const SVC_ROW_BULK = {
    'FEL 001':7,'FEL 002':8,'FEL 003':9,'FEL 004':10,'FEL 005':11,
    'ADT 001':12,'ADT 002':13,'ADT 003':14,'ADT 004':15,'ADT 005':16,'ADT 006':17,
    'EXC 001':18,'EXC 002':19,'EXC 003':20,'EXC 004':21,'EXC 005':22,
    'GEN 001':23,'GEN 002':24,'GEN 003':25,'GEN 004':26,'GEN 005':27,
    'SCRN 002':4,'BULLD 12':6,'BULLD 001':5,
  };

  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  let section = 'hours'; // hours | quarry | tailings | screen
  let written = 0;

  for (const line of lines) {
    const lu = line.toUpperCase();
    if (/^QUARRY/i.test(lu)) { section = 'quarry'; continue; }
    if (/^TAILING/i.test(lu)) { section = 'tailings'; continue; }
    if (/SCREEN.?MAT|SRCEEN.?MAT/i.test(lu)) { section = 'screen'; continue; }
    if (/^DIESEL\b/i.test(lu)) { section = 'diesel'; continue; }

    if (section === 'diesel') {
      const dCode = resolveMachine(line);
      const dLitres = parseDieselMachine(line);
      const dTab = dCode ? TAB_MAP[dCode] : null;
      if (dCode && dLitres && dTab) {
        let existing = 0;
        try {
          const cur = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "'" + dTab + "'!F" + row });
          existing = parseFloat((cur.data.values?.[0]?.[0] || '').toString().replace(/[^0-9.-]/g, '')) || 0;
        } catch(e) {}
        await writeCell(sheets, dTab, 'F' + row, existing + dLitres);
        written++;
      }
      continue;
    }

    if (section === 'hours') {
      // Format: "FEL 001 3191 (3250)" — 3191=closing hours (D), 3250=next service due (Services!D)
      const m = line.match(/^((?:(?:FEL|ADT|EXC|GEN|SCRN|DOZ)\s*\d{3}|BULLD\s*\d{1,3})(?:\s*\d+)?)[\s:]+([\d,]+)(?:[\s\(]+([\d,]+))?/i);
      if (!m) continue;
      let code = m[1].replace(/\s+/g,' ').toUpperCase().trim();
      // Normalize BULLD values:
      // - BULLD 12 → "BULLD 12"
      // - BULLD 001 / BULLD 1 → treat as DOZ 001 tab, but the bulk key is "BULLD 001"
      if (/^BULLD\s*\d+$/i.test(code)) {
        const n = parseInt(code.replace(/[^0-9]/g,''), 10);
        if (n === 1) code = 'BULLD 001';
        else code = 'BULLD ' + (n < 10 ? String(n).padStart(2,'0') : String(n));
      }
      const closing = parseFloat(m[2].replace(/,/g,''));
      const nextSvc = m[3] ? parseFloat(m[3].replace(/,/g,'')) : null;
      const tab = TAB_MAP_BULK[code]; if (!tab) continue;
      // D = closing hours (stop), D35 = closing hours
      if (closing) { await writeCell(sheets, tab, 'D' + row, closing); await writeCell(sheets, tab, 'D35', closing); }
      const svcRow = SVC_ROW_BULK[code];
      if (svcRow) {
        // Services sheet semantics:
        // C = HOURS at last service, D = NEXT SERVICE HOURS, E = today's current hours.
        // In the WhatsApp bulk close format, the bracket value is sometimes the *last service hours* (can be < closing).
        if (nextSvc != null) {
          if (closing != null && nextSvc < closing) {
            // Treat as last-service hours; compute next due by interval.
            const SVC_INTERVALS = {
              BULLD12:500,
              SCRN002:250, DOZ001:250,
              FEL001:250, FEL002:250, FEL003:250, FEL004:250, FEL005:250,
              ADT001:250, ADT002:250, ADT003:250, ADT004:250, ADT005:250, ADT006:250,
              EXC001:250, EXC002:250, EXC003:250, EXC004:250, EXC005:250,
              GEN001:250, GEN002:250, GEN003:250, GEN004:250, GEN005:250,
            };
            const key = code.replace(/\s+/g,'');
            const interval = SVC_INTERVALS[key] || 250;
            const nextDue = nextSvc + interval;
            await writeCell(sheets, 'Services', 'C' + svcRow, nextSvc);
            await writeCell(sheets, 'Services', 'D' + svcRow, nextDue);
          } else {
            // Treat as next service due
            await writeCell(sheets, 'Services', 'D' + svcRow, nextSvc);
          }
        }
        if (closing) await writeCell(sheets, 'Services', 'E' + svcRow, closing); // current hours
      }
      written++;
    } else {
      // Load line: "ADT 002 = 8" or "ADT002= 8"
      const m = line.match(/^(ADT\s*\d{3})\s*(?:=|:)\s*([\d]+(?:[.,]\d+)?)/i);
      if (!m) continue;
      let code = m[1].replace(/\s+/g,' ').toUpperCase().trim();
      // Normalize BULLD values:
      // - BULLD 12 → "BULLD 12"
      // - BULLD 001 / BULLD 1 → treat as DOZ 001 tab, but the bulk key is "BULLD 001"
      if (/^BULLD\s*\d+$/i.test(code)) {
        const n = parseInt(code.replace(/[^0-9]/g,''), 10);
        if (n === 1) code = 'BULLD 001';
        else code = 'BULLD ' + (n < 10 ? String(n).padStart(2,'0') : String(n));
      }
      const val = parseFloat(m[2].replace(',', '.')); // supports half loads like 0,5
      const tab = TAB_MAP_BULK[code];
      if (!tab || val == null || Number.isNaN(val)) continue;
      // H=Quarry, I=Stripping, J=Screen to Plant, K=Tailings, L=Concentrate(ADT006 only)
      // L is a Tons formula for ADT001-005 — never write to it
      const col = section === 'quarry' ? 'H' : section === 'tailings' ? 'K' : 'J';
      await writeCell(sheets, tab, col + row, val);
      written++;
    }
  }
  return written;
}

function isBulkMessage(text) {
  const lines = text.split(/\n/).filter(l => l.trim());
  const hourLines = lines.filter(l => /^(FEL|ADT|EXC|GEN|SCRN|DOZ)\s*\d{3}/i.test(l.trim()) || /^BULLD\s*\d{1,3}/i.test(l.trim()));
  return hourLines.length >= 3; // 3+ machine lines = bulk message
}

const VALID_MACHINE_CODES = new Set([
  'FEL001', 'FEL002', 'FEL003', 'FEL004', 'FEL005',
  'ADT001', 'ADT002', 'ADT003', 'ADT004', 'ADT005', 'ADT006',
  'EXC001', 'EXC002', 'EXC003', 'EXC004', 'EXC005',
  'GEN001', 'GEN002', 'GEN003', 'GEN004', 'GEN005',
  'SCRN002', 'DOZ001', 'BULLD12',
]);

function validateBulkMessage(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const errors = [];
  let section = 'hours';
  let validMachineCount = 0;
  let invalidMachines = [];

  for (const line of lines) {
    const lu = line.toUpperCase();
    if (/^QUARRY/i.test(lu)) { section = 'quarry'; continue; }
    if (/^TAILING/i.test(lu)) { section = 'tailings'; continue; }
    if (/SCREEN.?MAT|SRCEEN.?MAT/i.test(lu)) { section = 'screen'; continue; }
    if (/^DIESEL\b/i.test(lu)) { section = 'diesel'; continue; }

    if (section === 'hours') {
      const m = line.match(/^((?:(?:FEL|ADT|EXC|GEN|SCRN|DOZ)\s*\d{3}|BULLD\s*\d{1,3})(?:\s*\d+)?)[\s:]+([\d,]+)(?:[\s\(]+([\d,]+))?/i);
      if (m) {
        let code = m[1].replace(/\s+/g, ' ').toUpperCase().trim();
        if (/^BULLD\s*\d+$/i.test(code)) {
          const n = parseInt(code.replace(/[^0-9]/g, ''), 10);
          code = 'BULLD ' + (n < 10 ? String(n).padStart(2, '0') : String(n));
        }
        code = code.replace(/\s+/g, '');
        // Treat BULLD001 as the DOZ001 tab (Frederick: "Bulld001 in the sheet is named Doz 001").
        if (code === 'BULLD01' || code === 'BULLD001') code = 'DOZ001';
        if (VALID_MACHINE_CODES.has(code)) {
          validMachineCount++;
        } else {
          invalidMachines.push(m[1]);
        }
      }
    } else if (section === 'quarry' || section === 'tailings' || section === 'screen') {
      const m = line.match(/^(ADT\s*\d{3})\s*(?:=|:)\s*([\d]+(?:[.,]\d+)?)/i);
      if (m) {
        let code = m[1].replace(/\s+/g, '').toUpperCase();
        if (VALID_MACHINE_CODES.has(code)) {
          validMachineCount++;
        } else {
          invalidMachines.push(m[1]);
        }
      }
    } else if (section === 'diesel') {
      const m = line.match(/^((?:FEL|ADT|EXC|GEN|SCRN|DOZ)\s*\d{3})[\s:]+(\d+(?:[.,]\d+)?)/i);
      if (m) {
        let code = m[1].replace(/\s+/g, '').toUpperCase();
        if (VALID_MACHINE_CODES.has(code)) {
          validMachineCount++;
        } else {
          invalidMachines.push(m[1]);
        }
      }
    }
  }

  if (validMachineCount === 0) {
    errors.push('No valid machine codes found in message');
  }
  if (invalidMachines.length > 0) {
    errors.push('Invalid machine codes: ' + [...new Set(invalidMachines)].join(', '));
  }

  return {
    isValid: errors.length === 0,
    errors,
    validMachineCount,
  };
}

async function writeMessageToSheets(enriched, rawText, alertFn, options = {}) {
  console.log('[sheets_writer] ENTRY rawText=' + JSON.stringify((rawText||'').slice(0,80)));
  if (!rawText || !rawText.trim()) { console.log('[sheets_writer] SKIP: empty rawText'); return; }
  const text = normalizeInputText(rawText.trim());
  const ts = enriched?.ts || new Date().toISOString();
  const sast = getSASTDate(ts);
  const row = dayRow(sast);
  const sheets = getSheets();
  const messageId = enriched?.message_id || options?.messageId || '';
  const conversationId = enriched?.conversationId || options?.conversationId || '';

  const parsedBase = {
    sastDate: getSASTDateStr(ts),
    dayRow: row,
  };

  return _auditALS.run({ actions: [], auditId: makeConfirmId({ type: 'audit', range: String(messageId || ''), value: 0, op: 'msg' }) }, async () => {
    const store = _auditALS.getStore();
    const auditId = store?.auditId || null;

    await ensureServicesHeaderDate(sheets, sast);

    // Confirmation commands (OK/CORRECT)
    if (await handleConfirmationCommands(text, alertFn, sheets, { messageId, conversationId })) {
      auditLog({
        kind: 'wa_decision',
        auditId,
        messageId,
        conversationId,
        threadKey: conversationId && messageId ? `${conversationId}|${messageId}` : null,
        dedupeHash: options?.dedupeHash || null,
        rawText,
        parsed: { ...parsedBase, type: 'confirmation' },
        decision: { status: 'written', reasonCode: 'CONFIRMATION_COMMAND', reasonDetail: 'OK/CORRECT processed' },
        actions: store?.actions || [],
      });
      return;
    }

    const norm = text.toLowerCase();

  // ── BULK MULTI-MACHINE MESSAGE ────────────────────────────────────────────
  if (isBulkMessage(text)) {
    const validation = validateBulkMessage(text);
    
    if (!validation.isValid) {
      const errorMsg = '⚠️ Bulk close format error: ' + validation.errors.join('; ') + '. Raw data logged, no writes performed.';
      console.log('[sheets_writer] BULK VALIDATION FAILED: ' + validation.errors.join('; '));
      
      auditLog({ kind: 'bulk_invalid', messageId: options?.messageId, conversationId: options?.conversationId, rawText, summary: validation.errors.join('; ') });
      await appendInvalidBulkClose(
        rawText, 
        validation.errors.join('; '), 
        enriched?.message_id, 
        enriched?.conversationId
      );
      
      if (alertFn) await alertFn(errorMsg);
      return;
    }
    
    const written = await processBulkMessage(text, sheets, sast);
    console.log('[sheets_writer] BULK message: wrote ' + written + ' cells');
    if (alertFn && written > 0) await alertFn('✅ Bulk update processed: ' + written + ' entries written to sheet.');
    return;
  }

  // ── FUEL PRICE UPDATE ──────────────────────────────────────────────────
  // Triggers: "fuel price 19.50" / "K2 update 19.50" / "diesel price R19.50/L"
  const priceMatch = text.match(/(?:fuel\s+price|diesel\s+price|k2(?:\s+update)?)[:\s]+R?([\d]+(?:[.,]\d+)?)/i);
  if (priceMatch) {
    const newPrice = parseFloat(priceMatch[1].replace(',', '.'));
    if (newPrice > 5 && newPrice < 100) { // sanity check: R5-R100/L
      if (needsConfirm('fuel_price', newPrice)) {
        const state = purgePending(loadPending());
        const item = { type: 'fuel_price', op: 'set', range: 'Production Summary!K2', value: newPrice, ts, createdAtMs: Date.now() };
        item.id = makeConfirmId(item);
        state.items.push(item);
        savePending(state);
        if (alertFn) await alertFn('⚠️ Confirm fuel price: parsed R' + newPrice + '/L. Reply: OK ' + item.id + '  OR  CORRECT ' + item.id + ' <value>');
        console.log('[sheets_writer] FUEL PRICE pending confirm id=' + item.id);
        return;
      }
      await valuesUpdate(sheets, {
        spreadsheetId: SHEET_ID, range: 'Production Summary!K2',
        valueInputOption: 'RAW', requestBody: { values: [[newPrice]] },
      });
      console.log('[sheets_writer] FUEL PRICE updated: K2 = ' + newPrice);
      if (alertFn) await alertFn('✅ Fuel price updated to *R' + newPrice.toFixed(3) + '/L* — all cost calculations have been amended.');
      return;
    }
  }

  // ── SERVICE ──────────────────────────────────────────────────────────────
  if (/servi/i.test(norm)) {
    const machine = resolveMachine(text);
    // Match hours: 4-6 digit number followed by 'h' OR standalone 5-6 digit, but NOT year-like 4-digit (1900-2099)
    const mHours = text.match(/(\d{5,6})\s*h?|(?<!\/)(\d{4})h(?!\d)/i);
    const _rawHoursMatch = mHours ? (mHours[1] || mHours[2]) : null;
    const label = machine || 'unknown machine';
    const serviceHours = _rawHoursMatch ? parseInt(_rawHoursMatch) : null;

  const SERVICES_ROW = {
    'SCRN002': 4, 'DOZ001': 5, 'BULLD12': 6, 'BULLD 12': 6,
    'FEL001': 7, 'FEL002': 8, 'FEL003': 9, 'FEL004': 10, 'FEL005': 11,
    'ADT001': 12, 'ADT002': 13, 'ADT003': 14, 'ADT004': 15, 'ADT005': 16, 'ADT006': 17,
    'EXC001': 18, 'EXC002': 19, 'EXC003': 20, 'EXC004': 21, 'EXC005': 22,
    'GEN001': 23, 'GEN002': 24, 'GEN003': 25, 'GEN004': 26, 'GEN005': 27,
  };
    const rowNum = machine ? SERVICES_ROW[machine] : null;
    if (!rowNum || !serviceHours) {
      console.log('[sheets_writer] SERVICE: could not resolve machine/hours — alerting only');
      if (alertFn) await alertFn('⚙️ Service message received but could not auto-write — machine: *' + label + '*, hours: ' + (serviceHours||'?') + 'h. Please update sheet manually.');
      return;
    }
    // Get machine tab name for current hours lookup
    const TAB_FOR_MACHINE = {
      'SCRN002':'Finlay Screen - Scrn002','DOZ001':'DOZ 001','BULLD12':'BULLD 12',
      'FEL001':'RB Loader RB856 - FEL 001','FEL002':'RB Loader ZL60 - FEL 002',
      'FEL003':'Bell Loader - FEL 003','FEL004':'RB Loader RB856 - FEL 004','FEL005':'RB Loader RB856 - FEL 005',
      'ADT001':'Bell B20 ADT 001','ADT002':'RBullD CMT96 - ADT 002','ADT003':'ADT003',
      'ADT004':'Bell B40 - ADT 004','ADT005':'RB CMT96 - ADT 005','ADT006':'Powerstar 4035 - ADT 006',
      'EXC001':'Hyundai - EX 001','EXC002':'RB - EX 002','EXC003':'Volvo - EX 003',
      'EXC004':'RB - EX 004','EXC005':'RB - EX 005',
      'GEN001':'Gen - 001 SCREEN','GEN002':'Gen - 002','GEN003':'Gen - 003',
      'GEN004':'RP Gen - 004','GEN005':'Gen - 005 PLANT',
    };
    const tabName = TAB_FOR_MACHINE[machine];
    let currentHours = '';
    if (tabName) {
      try {
        const todayRow = 3 + sast.getUTCDate();
        const machR = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "'" + tabName + "'!C" + todayRow + ":D" + todayRow });
        const mRow = machR.data.values?.[0] || [];
        currentHours = parseFloat(mRow[1] || mRow[0] || '') || '';
      } catch(e) { console.log('[sheets_writer] SERVICE: could not get current hours:', e.message); }
    }
    // E is updated daily with current machine hours (separate daily write path)
    // Service event only writes B, C, D
    // Service intervals per machine
    const SVC_INTERVALS = {
      SCRN002:250, DOZ001:250, BULLD12:500,
      FEL001:250, FEL002:250, FEL003:250, FEL004:250, FEL005:250,
      ADT001:250, ADT002:250, ADT003:250, ADT004:250, ADT005:250, ADT006:250,
      EXC001:250, EXC002:250, EXC003:250, EXC004:250, EXC005:250,
      GEN001:250, GEN002:250, GEN003:250, GEN004:250, GEN005:250,
    };
    const interval = SVC_INTERVALS[machine] || 250;
    // Fixed milestones: 250, 500, 750... (500, 1000, 1500... for BULLD12)
    const nextDue = Math.ceil(serviceHours / interval) * interval;
    // currentHours = latest available from machine tab (C col = best available)
    const latestHours = currentHours || serviceHours;
    const hoursRemaining = nextDue - latestHours;
    // Date from WA message timestamp (DD/MM/YYYY for Sheets)
    const serviceDate = sast.getUTCDate() + '/' + (sast.getUTCMonth()+1) + '/' + sast.getUTCFullYear();
    // Write: B=date, C=WA hours, D=nextDue. E=updated daily. F=formula =D-E (never overwrite)
    await valuesUpdate(sheets, {
      spreadsheetId: SHEET_ID,
      range: 'Services!B' + rowNum + ':D' + rowNum,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[serviceDate, serviceHours, nextDue]] }
    });
    console.log('[sheets_writer] SERVICE written: ' + machine + ' B=' + serviceDate + ' C=' + serviceHours + ' D=' + nextDue);
    if (alertFn) await alertFn('✅ Service recorded: *' + label + '*\n• Date: ' + serviceDate + '\n• Hours (WA): ' + serviceHours + 'h\n• Next due: ' + nextDue + 'h');
    return;
  }

  // ── FUEL DIP ─────────────────────────────────────────────────────────────
  if (/(?:diesel|fuel)\s+dip|dip\s+\d/i.test(norm)) {
    const litres = parseFuelDip(text);
    if (litres) {
      if (needsConfirm('diesel_dip', litres)) {
        const state = purgePending(loadPending());
        const item = { type: 'diesel_dip', op: 'fuel_dip', value: litres, ts, createdAtMs: Date.now() };
        item.id = makeConfirmId(item);
        state.items.push(item);
        savePending(state);
        if (alertFn) await alertFn('⚠️ Confirm diesel dip: parsed ' + litres + 'L. Reply: OK ' + item.id + '  OR  CORRECT ' + item.id + ' <value>');
        console.log('[sheets_writer] DIESEL DIP pending confirm id=' + item.id);
        return;
      }
      await applyFuelDip(sheets, sast, litres, alertFn);
    }
    return;
  }

  // ── BAKKIES DIESEL ───────────────────────────────────────────────────────
  // Gate on vehicle name only — size regex (3L/2.8/2.5) false-positives on "203L","141L" etc
  const isBakkiesDiesel = /diesel/i.test(norm) && /hilux|vw bus|hino|bakkie|ranger|landcruiser|cruiser|fortuner/i.test(norm);
  if (isBakkiesDiesel) {
    const result = parseDieselBakkies(text);
    if (result) {
      const cell = colLetter(result.colIdx) + row;
      await writeCell(sheets, 'Bakkies', cell, result.litres);
    } else {
      console.log('[sheets_writer] BAKKIES: could not parse litres from: ' + text.slice(0, 60));
    }
    return;
  }

  // ── MACHINE MESSAGES ─────────────────────────────────────────────────────
  const machineCode = resolveMachine(text);

  if (!machineCode) {
    // Only flag if it looks like operational data
    if (/\d{4,}/.test(text) || /diesel|fuel|loads?|start|stop/i.test(text)) {
      console.log('[sheets_writer] UNKNOWN MACHINE: ' + text.slice(0, 80));
      if (alertFn) await alertFn('⚠️ Unknown machine in message: "' + text.slice(0, 60) + '". Please clarify.');
    }
    return false;
  }

  if (machineCode === 'BULLD001_RETIRED') {
    console.log('[sheets_writer] RETIRED machine BULLD001 in message — logged, not written');
    if (alertFn) await alertFn('⚠️ BULLD001 is retired — message logged, not written.');
    return;
  }

  const tabName = TAB_MAP[machineCode];
  if (!tabName) { console.log('[sheets_writer] No tab for ' + machineCode); return false; }

  // Hours
  const hoursData = parseHours(text);
  if (hoursData) {
    // C col: only write row 4 (opening hours) — rows 5+ use =IF(D{prev}=0,"",D{prev}) formula
    if (hoursData.start != null && row === 4) await writeCell(sheets, tabName, 'C' + row, hoursData.start);
    if (hoursData.stop != null) {
      await writeCell(sheets, tabName, 'D' + row, hoursData.stop);
      await writeCell(sheets, tabName, 'D35', hoursData.stop); // always update D35
      // Update Services!E for this machine (daily current hours — same principle as machine tab E)
      const SVC_ROW_MAP = {
        SCRN002:4, DOZ001:5, BULLD12:6, FEL001:7, FEL002:8, FEL003:9, FEL004:10, FEL005:11,
        ADT001:12, ADT002:13, ADT003:14, ADT004:15, ADT005:16, ADT006:17,
        EXC001:18, EXC002:19, EXC003:20, EXC004:21, EXC005:22,
        GEN001:23, GEN002:24, GEN003:25, GEN004:26, GEN005:27,
      };
      const svcRow = SVC_ROW_MAP[machineCode];
      if (svcRow) {
        await writeCell(sheets, 'Services', 'E' + svcRow, hoursData.stop);
        console.log('[sheets_writer] Services!E' + svcRow + ' = ' + hoursData.stop + ' (' + machineCode + ')');
      }
    }
    return;
  }

  // Diesel — accumulate (add to existing value if already written today)
  // Accept bare litre lines like 'BULLD 12 1007 L' as diesel, to reduce operator friction.
  const looksLikeBareLitres = !/\n/.test(text) && /\b\d+\s*[Ll](?:itres?|iters?)?\b/.test(norm) && /^\s*(?:FEL|ADT|EXC|GEN|SCRN|BULLD|DOZ)\s*\d{3}/i.test(text) && !/\(\s*\d+\s*\)/.test(text);
  if (/diesel|fuel|liter|litre/i.test(norm) || looksLikeBareLitres) {
    // Multi-line diesel: check if OTHER machines appear in this message too
    // e.g. "DIESEL\nGEN 005 141L\nFEL 004 203L" — write each machine independently
    const allLines = text.split(/\n/).filter(l => l.trim());
    const dieselLines = allLines.filter(l => /\d+\s*[Ll](?:itres?|iters?)?/.test(l) && /[A-Z]{2,4}\s*\d{3}/i.test(l));
    if (dieselLines.length > 1) {
      console.log('[sheets_writer] MULTI-LINE DIESEL: ' + dieselLines.length + ' machines detected');
      let wrote = 0;
      for (const dline of dieselLines) {
        const dCode = resolveMachine(dline);
        const dLitres = parseDieselMachine(dline);
        const dTab = dCode ? TAB_MAP[dCode] : null;
        if (!dCode || !dLitres || !dTab) { console.log('[sheets_writer] MULTI-DIESEL skip: ' + dline.trim()); continue; }
        let dExisting = 0;
        try {
          const cur = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "'" + dTab + "'!F" + row });
          dExisting = parseFloat((cur.data.values?.[0]?.[0]||'').toString().replace(/[^0-9.-]/g,''))||0;
        } catch(e) {}
        const dTotal = dExisting + dLitres;
        await writeCell(sheets, dTab, 'F' + row, dTotal);
        console.log('[sheets_writer] MULTI-DIESEL write: ' + dTab + '!F' + row + ' = ' + dExisting + '+' + dLitres + '=' + dTotal);
        wrote++;
      }
      if (wrote > 0) return true;
    }
    const litres = parseDieselMachine(text);
    console.log('[sheets_writer] DIESEL path: machine=' + machineCode + ' tab=' + tabName + ' row=' + row + ' litresRaw=' + litres);
    if (litres) {
      if (needsConfirm('diesel_issue', litres)) {
        const state = purgePending(loadPending());
        const item = { type: 'diesel_issue', op: 'add', range: '\'' + tabName + '\'!F' + row, value: litres, ts, createdAtMs: Date.now() };
        item.id = makeConfirmId(item);
        state.items.push(item);
        savePending(state);
        if (alertFn) await alertFn('⚠️ Confirm diesel issue: parsed ' + litres + 'L for ' + machineCode + '. Reply: OK ' + item.id + '  OR  CORRECT ' + item.id + ' <value>');
        console.log('[sheets_writer] DIESEL ISSUE pending confirm id=' + item.id);
        return false;
      }
      let existing = 0;
      try {
        const cur = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "'" + tabName + "'!F" + row });
        existing = parseFloat((cur.data.values?.[0]?.[0] || '').toString().replace(/[^0-9.-]/g,'')) || 0;
      } catch(e) { console.log('[sheets_writer] DIESEL read error: ' + e.message); }
      const total = existing + litres;
      console.log('[sheets_writer] DIESEL write: ' + tabName + '!F' + row + ' existing=' + existing + ' +' + litres + ' = ' + total);
      await writeCell(sheets, tabName, 'F' + row, total);
      console.log('[sheets_writer] DIESEL done: ' + tabName + ' F' + row + ' = ' + total);
    } else {
      console.log('[sheets_writer] DIESEL: parseDieselMachine returned null for: ' + text.slice(0,60));
    }
    return;
  }

  // Loads (ADT only)
  if (/ADT/.test(machineCode) && /load|quarry|screen|tailing/i.test(norm)) {
    const loadsData = parseLoads(text);
    if (loadsData) {
      const colMap = { quarry: 'H', screen: 'J', tailings: 'K' };
      const col = colMap[loadsData.category];
      if (col) await writeCell(sheets, tabName, col + row, loadsData.loads);
    }
    return;
  }

  // If we got here, we parsed nothing actionable.
  try {
    const store = _auditALS.getStore();
    auditLog({ kind: 'wa_decision', auditId: store?.auditId || null, messageId, conversationId, threadKey: conversationId && messageId ? `${conversationId}|${messageId}` : null, dedupeHash: options?.dedupeHash || null, rawText, parsed: { ...parsedBase, type: 'unknown' }, decision: { status: 'ignored', reasonCode: 'NO_MATCHING_PARSER', reasonDetail: 'no parser matched message' }, actions: store?.actions || [] });
  } catch (e) {}
});
}

module.exports = { 
  writeMessageToSheets, 
  sheetsWriteCall, 
  valuesUpdate,
  validateBulkMessage,
  appendToRawData,
  appendInvalidBulkClose,
  getSASTDateStr,
};
