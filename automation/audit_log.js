const fs = require('fs');
const path = require('path');

const AUDIT_FILE = process.env.AUDIT_FILE || path.join(__dirname, 'audit-decisions.jsonl');
const AUDIT_MAX_BYTES = parseInt(process.env.AUDIT_MAX_BYTES || String(20 * 1024 * 1024), 10); // 20MB
const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '7', 10);
const PRUNE_COOLDOWN_MS = parseInt(process.env.AUDIT_PRUNE_COOLDOWN_MS || String(6 * 60 * 60 * 1000), 10); // 6h
let _lastPruneMs = 0;

function _rotateIfNeeded() {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return;
    const st = fs.statSync(AUDIT_FILE);
    if (st.size < AUDIT_MAX_BYTES) return;
    const rotated = AUDIT_FILE.replace(/\.jsonl$/, '') + '.' + Date.now() + '.jsonl';
    fs.renameSync(AUDIT_FILE, rotated);
  } catch { /* ignore */ }
}

function _parseTs(lineObj) {
  try {
    const ts = lineObj?.ts;
    if (!ts) return null;
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function _pruneIfNeeded() {
  const now = Date.now();
  if (now - _lastPruneMs < PRUNE_COOLDOWN_MS) return;
  _lastPruneMs = now;

  const cutoff = now - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  // 1) Prune main JSONL (keep last N days)
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const raw = fs.readFileSync(AUDIT_FILE, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      const kept = [];
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const ms = _parseTs(obj);
          if (ms == null || ms >= cutoff) kept.push(line);
        } catch {
          kept.push(line);
        }
      }
      if (kept.length !== lines.length) {
        const tmp = AUDIT_FILE + '.tmp';
        fs.writeFileSync(tmp, kept.join('\n') + '\n');
        fs.renameSync(tmp, AUDIT_FILE);
      }
    }
  } catch { /* ignore */ }

  // 2) Delete rotated audit files older than cutoff (by mtime)
  try {
    const dir = path.dirname(AUDIT_FILE);
    const base = path.basename(AUDIT_FILE).replace(/\.jsonl$/, '');
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (!f.startsWith(base + '.') || !f.endsWith('.jsonl')) continue;
      const full = path.join(dir, f);
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs < cutoff) fs.unlinkSync(full);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

let _botVersion = null;
function _getBotVersion() {
  if (_botVersion) return _botVersion;
  try {
    const headPath = path.join(__dirname, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, 'utf8').trim();
      if (head.startsWith('ref:')) {
        const ref = head.split(' ')[1].trim();
        const refPath = path.join(__dirname, '.git', ref);
        if (fs.existsSync(refPath)) {
          _botVersion = fs.readFileSync(refPath, 'utf8').trim().slice(0, 12);
          return _botVersion;
        }
      }
      _botVersion = head.slice(0, 12);
      return _botVersion;
    }
  } catch { /* ignore */ }
  _botVersion = 'unknown';
  return _botVersion;
}

function _shortId() {
  try {
    return Math.random().toString(16).slice(2, 10);
  } catch {
    return 'unknown';
  }
}

function auditLog(row) {
  try {
    _pruneIfNeeded();
    _rotateIfNeeded();
    const entry = {
      schemaVersion: 2,
      ts: row.ts || new Date().toISOString(),
      auditId: row.auditId || _shortId(),
      kind: row.kind || 'unknown',
      messageId: row.messageId || null,
      conversationId: row.conversationId || null,
      threadKey: row.threadKey || (row.conversationId && row.messageId ? `${row.conversationId}|${row.messageId}` : null),
      dedupeHash: row.dedupeHash || null,

      botVersion: row.botVersion || _getBotVersion(),

      rawText: row.rawText || null,
      summary: row.summary || null,
      parsed: row.parsed || null,
      decision: row.decision || null,
      waReply: row.waReply || null,
      ocr: row.ocr || null,

      actions: row.actions || null,
      result: row.result || null,
    };
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
  } catch { /* ignore */ }
}

module.exports = { AUDIT_FILE, auditLog };
