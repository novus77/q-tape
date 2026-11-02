#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! curl --silent --max-time 3 -X POST http://127.0.0.1:18545 -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | grep -q '"result":"0xc4"'; then
  echo "fork tests require the X Layer Anvil fork at http://127.0.0.1:18545 (chain 196)" >&2
  exit 1
fi

echo "== experiment regression (21 cases) =="
(cd experiments/guardian-fork && forge test --fork-url http://127.0.0.1:18545 -vv)

echo "== formal Guardian (contracts) =="
(cd contracts && forge test --fork-url http://127.0.0.1:18545 -vv)

echo "== client fork tests =="
(cd packages/client && Q_TAPE_RUN_FORK_TESTS=1 bun test)

echo "== independent CLI lifecycle (local Anvil only) =="
bun run scripts/mvp-e2e.ts

echo "test:fork: OK"
