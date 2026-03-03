#!/usr/bin/env bash
set -euo pipefail

URL_LOCAL="http://127.0.0.1:3002"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL_LOCAL/")
echo "dashboard_http_code=$CODE"
if [[ "$CODE" != "200" && "$CODE" != "302" ]]; then
  echo "Healthcheck failed" >&2
  exit 1
fi

echo "OK"
