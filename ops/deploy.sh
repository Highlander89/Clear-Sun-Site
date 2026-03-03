#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DASH="$ROOT/dashboard"
WA="$ROOT/wa"

echo "[deploy] root=$ROOT"

# install deps
( cd "$DASH" && npm ci )
( cd "$DASH" && npm run build )
( cd "$WA" && npm ci )

# restart via pm2 if present
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart clearsun-dashboard || pm2 start "$DASH/node_modules/.bin/next" --name clearsun-dashboard -- start -- -p 3002
  pm2 restart clearsun-wa || pm2 start "$WA/index.js" --name clearsun-wa
  pm2 save || true
fi

"$ROOT/ops/healthcheck.sh"
