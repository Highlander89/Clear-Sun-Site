#!/usr/bin/env bash
set -euo pipefail
TAG=${1:-}
if [ -z "$TAG" ]; then
  echo "Usage: $0 <git-tag>" >&2
  exit 2
fi
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
git fetch --tags --all || true
git checkout "$TAG"
bash "$ROOT/ops/deploy.sh"
