#!/usr/bin/env bash
set -euo pipefail

TS=$(date +%Y%m%d-%H%M%S)
OUT_DIR="/home/ubuntu/.openclaw/workspace/output"
REPORT="$OUT_DIR/qa-smoke-$TS.md"
mkdir -p "$OUT_DIR"

{
  echo "# Clearsun QA Smoke"
  echo
  echo "- Timestamp: $(date -Is)"
  echo
  echo "## Bot syntax"
  cd /home/ubuntu/clearsun-wa
  node -c index.js
  node -c sheets_writer.js
  node -c ocr_service_sheet.js
  node -c ecosystem.config.js
  node -c queue.js
  node -c idempotency_ledger.js
  echo "OK"

  echo
  echo "## Drift check (bulk-close-rules)"
  node /home/ubuntu/clearsun-wa/scripts/drift-check.js || true

  echo
  echo "## PM2 status"
  pm2 show clearsun-wa | egrep "status|uptime|restarts|unstable restarts|interpreter args|exec cwd" || true

  echo
  echo "## Dashboard quick health"
  curl -sS -I --max-time 20 http://51.20.84.35:3002 | head -5
  curl -sS --max-time 20 http://51.20.84.35:3002/api/health | head -c 300; echo

  echo
  echo "## Queue summary"
  node /home/ubuntu/clearsun-wa/replay_queue.js | tail -20

} > "$REPORT"

echo "$REPORT"
