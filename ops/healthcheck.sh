#!/usr/bin/env bash
set -euo pipefail
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/)
echo "dashboard_http=$code"
[ "$code" = "200" ] || [ "$code" = "307" ]
api=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/api/health)
echo "api_health_http=$api"
[ "$api" = "200" ]
