# Browser UX Contract (M2)

The web surface is intentionally small: read-only evidence first, ordinary wallet only for empty Vault deployment / NFT deposit. Browser code never imports `@qtape/signer`, never has a Falcon private-key or backup-passphrase field, and never calls a server endpoint that returns one.

## States the UI must show

| State | Trigger | Required display |
|---|---|---|
| `PROTECTED` | `inspectSite` returns a verified fixed profile and holder is a matching Vault | Vault, block/hash, processor, Container, activation range, key fingerprint; no unqualified “safe forever” badge |
| `DEPOSITED_UNVERIFIED` | Vault holds the NFT but protection/profile checks are not complete | Explicit “not yet verified” text; do not use green protection badge |
| `UNPROTECTED` / `EXITED` | Holder is not a Q-Tape Vault or the Vault no longer holds the NFT | Holder, observed block, and exit/unprotected wording |
| `CONFIG_CHANGED` / `UNSUPPORTED` | Accepted implementation/profile mismatch or unsupported name | Stop; no planning or protection claim |
| `RPC_DISAGREEMENT` | Two operators disagree on block hash/read | Stop; show disagreement, do not retry silently |
| `wrong network` | Wallet chain id != 196 | Show actual/expected chain, no ETH send |
| `wrong account` | Wallet returns no account | No send |
| `invalid prepared transaction` | Pasted transaction has wrong chain/to/data/value | Reject before wallet request |
| `backup recovery failed` | Local `vault deposit` path cannot decrypt/verify bundle | Hard stop; no NFT deposit transaction |
| `unknown` submission | Broadcast outcome cannot be confirmed | Show unknown; do not resubmit a second request |

## Rules

- Read-only status does not require a wallet connection.
- Deployment/deposit show the exact chain, target, value and expected Vault address before the wallet prompt.
- Success transaction ≠ verified release. Only `release verify` with same-block dual-operator readback can show `VERIFIED`.
- All user-visible strings are textContent or escaped; no untrusted HTML injection.
- The adapter/Web never asks for a Falcon private key; all Falcon operations happen in the local CLI/signer process.

## Test coverage

`apps/web/test/app.test.ts` uses happy-dom to exercise the actual `mountApp` component: successful/failed inspection, wrong-chain deployment, wrong wallet network, deposit handoff, RPC disagreement and tab switching. This is a DOM-level component test, not a browser extension/real-wallet E2E.
