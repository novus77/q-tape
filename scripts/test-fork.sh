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

echo "== second read-only operator for client tests =="
if ! curl --silent --max-time 2 -X POST http://127.0.0.1:18546 -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | grep -q '"result":"0xc4"'; then
  anvil --fork-url https://rpc.xlayer.tech --fork-block-number 74818827 --chain-id 196 --host 127.0.0.1 --port 18546 --silent &
  sleep 3
fi

echo "== client fork tests =="
(cd packages/client && Q_TAPE_RUN_FORK_TESTS=1 bun test)

echo "== independent CLI lifecycle (local Anvil only) =="
bun run scripts/mvp-e2e.ts

echo "test:fork: OK"
