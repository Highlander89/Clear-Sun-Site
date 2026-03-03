const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, 'queue.jsonl');
const SENT_STATE_FILE = path.join(__dirname, '.sent-state.json');

function safeReadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function safeWriteJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

// ── M4: Sent-state pruning (prevents .sent-state.json from growing forever) ──
const SENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;     // keep 7 days of ids
const SENT_MAX_KEYS = 20000;                      // hard cap

function _normalizeSentState(s) {
  if (!s || typeof s !== 'object') return { sent: {}, updatedAt: null };
  if (!s.sent || typeof s.sent !== 'object') s.sent = {};

  // Back-compat: older versions stored booleans. Convert to timestamps.
  const now = Date.now();
  for (const [k, v] of Object.entries(s.sent)) {
    if (v === true) s.sent[k] = now;
    else if (typeof v !== 'number') delete s.sent[k];
  }
  return s;
}

function _pruneSentState(s) {
  const now = Date.now();
  for (const [k, ts] of Object.entries(s.sent)) {
    if (typeof ts !== 'number' || now - ts > SENT_TTL_MS) delete s.sent[k];
  }

  const keys = Object.keys(s.sent);
  if (keys.length > SENT_MAX_KEYS) {
    keys.sort((a, b) => (s.sent[a] || 0) - (s.sent[b] || 0)); // oldest first
    const toDrop = keys.length - SENT_MAX_KEYS;
    for (let i = 0; i < toDrop; i++) delete s.sent[keys[i]];
  }
}

function loadSentState() {
  const s = _normalizeSentState(safeReadJson(SENT_STATE_FILE, { sent: {}, updatedAt: null }));
  _pruneSentState(s);
  return s;
}

function markSent(messageId) {
  if (!messageId) return;
  const s = loadSentState();
  s.sent[messageId] = Date.now();
  s.updatedAt = new Date().toISOString();
  _pruneSentState(s);
  safeWriteJson(SENT_STATE_FILE, s);
}

function isSent(messageId) {
  if (!messageId) return false;
  const s = loadSentState();
  const ts = s.sent[messageId];
  if (typeof ts !== 'number') return false;
  if (Date.now() - ts > SENT_TTL_MS) return false;
  return true;
}
// ── End M4 ────────────────────────────────────────────────────────────────

function enqueue(item) {
  const row = { queuedAt: new Date().toISOString(), ...item };
  fs.appendFileSync(QUEUE_FILE, JSON.stringify(row) + '\n');
}

function readQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  const lines = fs.readFileSync(QUEUE_FILE, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

// ── M2: Token bucket rate limiter for Sheets appends (40/min) ─────────────
const RATE_LIMIT_MAX = 40;       // max appends per minute
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
let _rlTokens = RATE_LIMIT_MAX;
let _rlLastRefill = Date.now();
const _rlPendingQueue = [];      // { fn, retryAt }
const RATE_LIMIT_QUEUE_MAX = 500; // hard cap to prevent unbounded memory growth
let _rlDrainTimer = null;

function _refillTokens() {
    const now = Date.now();
    const elapsed = now - _rlLastRefill;
    const refill = Math.floor(elapsed / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_MAX;
    if (refill > 0) {
        _rlTokens = Math.min(RATE_LIMIT_MAX, _rlTokens + refill);
        _rlLastRefill = now;
    }
}

function _drainQueue() {
    if (_rlPendingQueue.length === 0) { _rlDrainTimer = null; return; }
    _refillTokens();
    const now = Date.now();
    while (_rlPendingQueue.length > 0 && _rlTokens > 0) {
        const item = _rlPendingQueue.shift();
        if (now < item.retryAt) {
            _rlPendingQueue.unshift(item);
            break;
        }
        _rlTokens--;
        item.fn();
    }
    if (_rlPendingQueue.length > 0) {
        if (!_rlDrainTimer) _rlDrainTimer = setTimeout(_drainQueue, 1500);
    } else {
        _rlDrainTimer = null;
    }
}

/**
 * Rate-limited wrapper for any Sheets append operation (≤40/min token bucket).
 * Pass an async function; called immediately if tokens available, else queued.
 */
function rateLimitedAppend(fn, logFn) {
    _refillTokens();
    if (_rlTokens > 0) {
        _rlTokens--;
        return Promise.resolve().then(fn);
    }
    const retryDelay = Math.ceil(RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX);
    const retryAt = Date.now() + retryDelay;
    const log = logFn || console.log;
    log(`[RATELIMIT] queued, will retry in ${Math.round(retryDelay/1000)}s (queue length: ${_rlPendingQueue.length + 1})`);
    return new Promise((resolve, reject) => {
        if (_rlPendingQueue.length >= RATE_LIMIT_QUEUE_MAX) {
            return reject(new Error('Rate limit queue overflow: too many pending appends'));
        }
        _rlPendingQueue.push({ fn: () => Promise.resolve().then(fn).then(resolve).catch(reject), retryAt });
        if (!_rlDrainTimer) _rlDrainTimer = setTimeout(_drainQueue, retryDelay);
    });
}
// ── End M2 ─────────────────────────────────────────────────────────────────

module.exports = {
  QUEUE_FILE,
  SENT_STATE_FILE,
  loadSentState,
  markSent,
  isSent,
  enqueue,
  readQueue,
  rateLimitedAppend,
};
