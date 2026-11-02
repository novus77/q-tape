#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for package in packages/schema packages/protocol packages/signer packages/client packages/cli packages/adapter-vite apps/relayer apps/web examples/publisher-adapter; do
  echo "-- $package"
  (cd "$package" && bun run typecheck)
done
