# Local Browser Wallet E2E

`bun run web:e2e` runs the real Web build in Google Chrome through `playwright-core` against the local X Layer fork. It is local-only and uses an injected mock EIP-1193 provider; it is not a real wallet or extension test.

Covered:

- status page reads without any wallet provider;
- deposit handoff calls `eth_sendTransaction` only after the server returns the exact transaction;
- wrong wallet chain is rejected before sending;
- invalid prepared transaction is rejected before touching the wallet.

Prerequisites:

```bash
# X Layer fork on 18545; script starts 18546 if absent
anvil --fork-url https://rpc.xlayer.tech --fork-block-number 74818827 --chain-id 196 --host 127.0.0.1 --port 18545 --silent
bun run web:e2e
```

The script uses the system Chrome channel or `Q_TAPE_CHROME_CHANNEL`. It writes `experiments/guardian-fork/results/web-e2e/` (gitignored). It is not included in CI because CI runners do not guarantee a Chrome binary.
