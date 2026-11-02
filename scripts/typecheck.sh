#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for package in packages/schema packages/protocol packages/signer packages/client packages/cli apps/relayer apps/web; do
  echo "-- $package"
  (cd "$package" && bun run typecheck)
done
