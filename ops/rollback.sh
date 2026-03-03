#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "usage: ops/rollback.sh <tag>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git fetch --tags || true
git checkout "$TAG"

"$ROOT/ops/deploy.sh"
