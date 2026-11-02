#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== format =="
(cd experiments/guardian-fork && forge fmt --check src test && bash -n tools/bootstrap.sh)
(cd contracts && forge fmt --check src test && bash -n scripts/bootstrap.sh)
(cd packages/signer && bash -n scripts/bootstrap.sh)

echo "== typecheck =="
for package in packages/schema packages/protocol packages/signer packages/client packages/cli apps/relayer apps/web; do
  echo "-- $package"
  (cd "$package" && bun run typecheck)
done

echo "== unit tests =="
for package in packages/schema packages/protocol packages/signer packages/client packages/cli apps/relayer apps/web; do
  echo "-- $package"
  (cd "$package" && bun test)
done

echo "check: OK"
