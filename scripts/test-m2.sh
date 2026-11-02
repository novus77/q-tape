#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== M2 static security review =="
bun run security:review

echo "== M2 contract fuzz/fee/invariant suites =="
(cd contracts && forge fmt --check src test && forge test --match-contract 'GuardianFeeFixtureTest|GuardianFuzzTest|GuardianInvariantTest')

echo "== M2 adapter and component tests =="
(cd packages/adapter-vite && bun test)
(cd apps/web && bun test)

if ! curl --silent --max-time 3 -X POST http://127.0.0.1:18545 -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | grep -q '"result":"0xc4"'; then
  echo "M2 E2E requires the local X Layer Anvil fork at http://127.0.0.1:18545" >&2
  exit 1
fi

echo "== M2 independent lifecycle (Vite fixture + renewal + relayer + exit) =="
bun run m2:e2e
echo "test:m2: OK"
