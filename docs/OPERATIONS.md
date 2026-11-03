# Operations Runbook (M3 readiness)

This runbook is for local/test rehearsal and the future approved pilot. It does not authorize public-chain actions.

## Monitoring

Relayer endpoints:

- `GET /health`: chain ID and latest observed block.
- `GET /metrics`: total requests, status distribution, last update (no signatures, no key material).

Probe both relayer and RPC:

```bash
bun scripts/monitor.ts \
  --relayer http://127.0.0.1:8787 \
  --rpc http://127.0.0.1:18545 \
  --chain-id 196 --max-lag 300
```

The probe prints JSON and exits 1 on chain mismatch, unhealthy relayer, or excessive block lag. Optional alert thresholds:

```bash
--max-unknown 0 --max-reverted 0 --max-submitted 5
```

`ops/prometheus/qtape-alerts.yml` contains Prometheus alert rules for relayer down, unknown results and stuck submissions. The relayer exposes JSON at `/metrics` and Prometheus text at `/metrics.prom`.

Suggested alert conditions for a pilot:

- relayer `/health` unavailable for > 2 minutes;
- request stuck in `submitted`/`unknown` beyond the expected confirmation window;
- RPC block lag above the profile `maxPinLag`;
- repeated `NONCE_CONFLICT`, `SIMULATION_FAILED`, `RPC_DISAGREEMENT`, or `BUDGET_EXCEEDED`;
- relayer gas balance below the approved minimum.

## Fee and funding policy

- `Q_TAPE_RELAYER_MAX_GAS` and `Q_TAPE_RELAYER_MAX_VALUE` are hard per-request caps; never raise them without written approval.
- Relayer pays only gas/value it explicitly chooses; users can submit the same signed request themselves.
- The relayer never receives a Falcon key or backup passphrase; compromising it cannot create a new authorization.
- Renewal fee is read from `DomainBinding.monthlyFee()` at signing time; a changed fee requires a new quote/signature.

## Incident response

1. Stop accepting new requests (`server.stop`) but keep records; do not delete evidence.
2. Check the digest record, transaction receipt, current nonce and actual file bytes at one block across two RPC operators.
3. If status is `unknown`, do **not** blindly resubmit. Wait for chain evidence; a user may self-broadcast only if the original request is still valid and nonce matches.
4. If a Vault is compromised or a wrong request was signed, use the pre-approved exit/key-rotation path with the user's local signer; no classic ECDSA recovery.
5. Publish an incident note without keys, signatures, passphrases or private user data.

## Manual user fallback

The user can always submit `qtape request submit <signed.json> --json` through their own wallet. Stopping the relayer must not block user self-broadcast or exit.

## Key handling

- Local signer runs on the user's machine; passphrase from terminal/stdin only.
- Never put Falcon keys/passphrases in relayer, CI, browser, argv, environment variables, logs or temporary plaintext files.
- Backup recovery must succeed on a second machine before any NFT deposit.
