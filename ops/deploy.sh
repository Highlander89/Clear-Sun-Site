#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
echo "Deploying from $ROOT"
cd "$ROOT/dashboard"
npm ci
npm run build
pm2 restart clearsun-dashboard || pm2 start ecosystem.config.js --only clearsun-dashboard

cd "$ROOT/automation"
npm ci
pm2 restart clearsun-wa || pm2 start ecosystem.config.js --only clearsun-wa

bash "$ROOT/ops/healthcheck.sh"
