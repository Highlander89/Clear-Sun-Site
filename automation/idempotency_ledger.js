const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEDGER_FILE = path.join(__dirname, '.idempotency-ledger.json');
const LEDGER_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
const LEDGER_MAX_ENTRIES = 50000;

function _loadLedger() {
  try {
    const data = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
    if (!data || typeof data !== 'object') return { entries: {}, updatedAt: null };
    return data;
  } catch {
    return { entries: {}, updatedAt: null };
  }
}

function _saveLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
}

function _pruneLedger(ledger) {
  const now = Date.now();
  const entries = ledger.entries;
  let pruned = 0;
  
  for (const key of Object.keys(entries)) {
    const entry = entries[key];
    if (entry.ts && (now - entry.ts > LEDGER_TTL_MS)) {
      delete entries[key];
      pruned++;
    }
  }
  
  const keys = Object.keys(entries);
  if (keys.length > LEDGER_MAX_ENTRIES) {
    keys.sort((a, b) => (entries[a].ts || 0) - (entries[b].ts || 0));
    const toDrop = keys.length - LEDGER_MAX_ENTRIES;
    for (let i = 0; i < toDrop; i++) {
      delete entries[keys[i]];
      pruned++;
    }
  }
  
  return pruned;
}

function _makeKey(opType, machine, dateStr, extra) {
  const payload = JSON.stringify({ op: opType, machine, date: dateStr, extra });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

function _makeAdditiveKey(opType, machine, dateStr, value) {
  const payload = JSON.stringify({ op: opType, machine, date: dateStr, value, additive: true });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

function checkIdempotency(opType, machine, dateStr, extra) {
  const ledger = _loadLedger();
  const key = _makeKey(opType, machine, dateStr, extra);
  const entry = ledger.entries[key];
  
  if (entry && entry.ts) {
    const age = Date.now() - entry.ts;
    if (age < LEDGER_TTL_MS) {
      return { alreadyWritten: true, key, existingValue: entry.value, ts: entry.ts };
    }
  }
  return { alreadyWritten: false, key, existingValue: null, ts: null };
}

function checkAdditiveIdempotency(opType, machine, dateStr, value) {
  const ledger = _loadLedger();
  const key = _makeAdditiveKey(opType, machine, dateStr, value);
  const entry = ledger.entries[key];
  
  if (entry && entry.ts) {
    const age = Date.now() - entry.ts;
    if (age < LEDGER_TTL_MS) {
      return { alreadyWritten: true, key, existingValue: entry.value, ts: entry.ts };
    }
  }
  return { alreadyWritten: false, key, existingValue: null, ts: null };
}

function markIdempotent(opType, machine, dateStr, extra, value) {
  const ledger = _loadLedger();
  const key = _makeKey(opType, machine, dateStr, extra);
  ledger.entries[key] = { op: opType, machine, date: dateStr, extra, value, ts: Date.now() };
  _pruneLedger(ledger);
  _saveLedger(ledger);
  return key;
}

function markAdditiveIdempotent(opType, machine, dateStr, value) {
  const ledger = _loadLedger();
  const key = _makeAdditiveKey(opType, machine, dateStr, value);
  ledger.entries[key] = { op: opType, machine, date: dateStr, value, additive: true, ts: Date.now() };
  _pruneLedger(ledger);
  _saveLedger(ledger);
  return key;
}

function getLedgerStats() {
  const ledger = _loadLedger();
  const now = Date.now();
  let valid = 0;
  let expired = 0;
  
  for (const key of Object.keys(ledger.entries)) {
    const entry = ledger.entries[key];
    if (entry.ts && (now - entry.ts <= LEDGER_TTL_MS)) {
      valid++;
    } else {
      expired++;
    }
  }
  
  return {
    total: Object.keys(ledger.entries).length,
    valid,
    expired,
    lastUpdated: ledger.updatedAt
  };
}

module.exports = {
  LEDGER_FILE,
  LEDGER_TTL_MS,
  checkIdempotency,
  checkAdditiveIdempotency,
  markIdempotent,
  markAdditiveIdempotent,
  getLedgerStats,
};
