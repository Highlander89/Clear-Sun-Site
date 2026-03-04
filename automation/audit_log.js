const fs = require('fs');
const path = require('path');

const AUDIT_FILE = process.env.AUDIT_FILE || path.join(__dirname, 'audit-decisions.jsonl');
const AUDIT_MAX_BYTES = parseInt(process.env.AUDIT_MAX_BYTES || String(20 * 1024 * 1024), 10); // 20MB

function _rotateIfNeeded() {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return;
    const st = fs.statSync(AUDIT_FILE);
    if (st.size < AUDIT_MAX_BYTES) return;
    const rotated = AUDIT_FILE.replace(/\.jsonl$/, '') + '.' + Date.now() + '.jsonl';
    fs.renameSync(AUDIT_FILE, rotated);
  } catch { /* ignore */ }
}

function auditLog(row) {
  try {
    _rotateIfNeeded();
    const entry = {
      ts: new Date().toISOString(),
      kind: row.kind || 'unknown',
      messageId: row.messageId || null,
      conversationId: row.conversationId || null,
      rawText: row.rawText || null,
      summary: row.summary || null,
      actions: row.actions || null,
      result: row.result || null,
    };
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
  } catch { /* ignore */ }
}

module.exports = { AUDIT_FILE, auditLog };
