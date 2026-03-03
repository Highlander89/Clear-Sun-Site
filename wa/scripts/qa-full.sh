#!/usr/bin/env bash
set -euo pipefail

TS=$(date +%Y%m%d-%H%M%S)
OUT_DIR="/home/ubuntu/.openclaw/workspace/output"
REPORT="$OUT_DIR/qa-full-$TS.md"
mkdir -p "$OUT_DIR"

{
  echo "# Clearsun QA Full"
  echo
  echo "- Timestamp: $(date -Is)"

  echo
  echo "## Bot"
  cd /home/ubuntu/clearsun-wa
  echo "### Syntax"
  node -c index.js
  node -c sheets_writer.js
  node -c ocr_service_sheet.js
  node -c ecosystem.config.js

  echo
  echo "### Control-char scan (sheets_writer.js)"
  python3 - <<'PY'
from pathlib import Path
b=Path('/home/ubuntu/clearsun-wa/sheets_writer.js').read_bytes()
bad=[(i,x) for i,x in enumerate(b) if x<32 and x not in (9,10,13)]
print('bad_count',len(bad))
if bad:
  print('sample',bad[:20])
PY

  echo
  echo "### Wrapper bypass scan"
  rg -n "spreadsheets\\.(values\\.(update|append)|batchUpdate)" /home/ubuntu/clearsun-wa --glob '!**/node_modules/**' --glob '!**/*.bak-*' || true

  echo
  echo "### Confirmation hooks present"
  rg -n "needsConfirm\(|handleConfirmationCommands\(" /home/ubuntu/clearsun-wa/sheets_writer.js || true

  echo
  echo "### Reconnect dampening hooks present"
  rg -n "reconnectAttempt|disconnectWindow|RECONNECT_MAX_MS|pendingChurnAlert" /home/ubuntu/clearsun-wa/index.js || true

  echo
  echo "### PM2 restart + log tail"
  pm2 restart clearsun-wa --update-env
  sleep 3
  pm2 logs clearsun-wa --lines 30 --nostream 2>/dev/null | tail -30

  echo
  echo "## Dashboard"
  cd /home/ubuntu/clearsun-dashboard
  echo "### Lint"
  npm -s run lint || true

  echo
  echo "### HTTP checks"
  curl -sS -I --max-time 10 http://51.20.84.35:3002 | head -5
  curl -sS -I --max-time 10 http://51.20.84.35:3002/login | head -5
  curl -sS --max-time 10 http://51.20.84.35:3002/api/health | head -c 300; echo

  echo
  echo "## Spec presence"
  test -f /home/ubuntu/.openclaw/workspace/docs/specs/clearsun-whatsapp-sheets-business-logic-spec.md && echo "SPEC_OK"

} > "$REPORT"

echo "$REPORT"
