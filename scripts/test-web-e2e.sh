#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cleanup() {
  lsof -ti tcp:18790 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti tcp:18546 2>/dev/null | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT
if ! curl --silent --max-time 2 -X POST http://127.0.0.1:18545 -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | grep -q '"result":"0xc4"'; then
  echo "web e2e requires the X Layer Anvil fork on 18545" >&2
  exit 1
fi
if ! curl --silent --max-time 2 -X POST http://127.0.0.1:18546 -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | grep -q '"result":"0xc4"'; then
  anvil --fork-url https://rpc.xlayer.tech --fork-block-number 74818827 --chain-id 196 --host 127.0.0.1 --port 18546 --silent >/tmp/qtape-web-e2e-anvil.log 2>&1 &
  sleep 3
fi
Q_TAPE_WEB_PORT=18790 Q_TAPE_WEB_RPC_URLS=http://127.0.0.1:18545,http://127.0.0.1:18546 bun apps/web/src/server.ts >/tmp/qtape-web-e2e-server.log 2>&1 &
for i in $(seq 1 30); do
  if curl --silent --max-time 2 http://127.0.0.1:18790/api/health | grep -q '"ok":true'; then break; fi
  sleep 1
done
bun scripts/web-e2e.ts
echo "web:e2e: OK"
