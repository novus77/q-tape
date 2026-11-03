#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() {
  lsof -ti tcp:18548 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti tcp:18549 2>/dev/null | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT

# The fixture drill requires a fresh Anvil account (deployment nonce 0).
lsof -ti tcp:18548 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti tcp:18549 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1
anvil --chain-id 196 --host 127.0.0.1 --port 18548 --silent >/tmp/qtape-m3-anvil.log 2>&1 &
sleep 3

echo "== M3.3 self-hosted fixture drill =="
bun run m3:fixture

echo "== M3 preflight against fixture =="
RESULT_DIR="experiments/guardian-fork/results/m3-fixture"
bun scripts/m3-preflight.ts \
  --profile-file "$RESULT_DIR/profile.json" \
  --site 10.2.0.tape \
  --rpc http://127.0.0.1:18548 --rpc http://127.0.0.1:18548

echo "test:m3: OK"
