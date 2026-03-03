const { execFileSync } = require('child_process');
const { readQueue, isSent, markSent } = require('./queue');

const SCRIPT = '/home/ubuntu/.openclaw/workspace/scripts/clearsun/clearsun_append_rawdata.sh';

function appendOne(item) {
  const enriched = item.enriched || {};
  const direction = item.direction || 'inbound';
  const fromName = enriched.sender || '';
  const fromNumber = enriched.sender || '';
  const text = enriched.text || '';
  const messageId = enriched.message_id || '';
  const conversationId = item.conversationId || '';

  execFileSync(
    SCRIPT,
    [direction, fromName, fromNumber, text, messageId, conversationId],
    { stdio: 'pipe', timeout: 30000 }
  );
}

function main() {
  const q = readQueue();
  let pendingBefore = 0;
  let appendedNow = 0;
  let failedNow = 0;
  const failures = [];

  for (const item of q) {
    const id = item?.enriched?.message_id;
    if (!id) continue;
    if (isSent(id)) continue;

    pendingBefore++;
    try {
      appendOne(item);
      markSent(id);
      appendedNow++;
    } catch (e) {
      failedNow++;
      failures.push({ id, error: (e && e.message) || String(e) });
    }
  }

  const summary = {
    ts: new Date().toISOString(),
    totalQueued: q.length,
    pendingBefore,
    appendedNow,
    failedNow,
    failures: failures.slice(0, 5),
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failedNow > 0) process.exit(2);
}

main();
