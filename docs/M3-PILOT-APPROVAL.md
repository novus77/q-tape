# M3.4 Pilot Approval and Preflight

M3.4 is a **gated mainnet pilot**. `scripts/m3-pilot.ts` only reads chain state and checks an approval file; it never signs or broadcasts.

## Approval file

Create an approval JSON with at least:

```json
{
  "schema": "qtape.pilot-approval.v1",
  "approvedBy": "independent-reviewer-or-owner",
  "approvedAt": "2026-11-03T00:00:00.000Z",
  "environment": {"name": "approved-pilot", "chainId": "196", "rpcUrls": ["https://operator-a", "https://operator-b"]},
  "site": "10.2.4.tape",
  "vault": "0x...",
  "nft": "0x...",
  "tokenId": "10",
  "container": "0x...",
  "scope": ["DEPLOY", "DEPOSIT", "PUBLISH", "RENEW", "ROTATE", "EXIT"],
  "limits": {"maxGasPerRequest": "8000000", "maxTotalGas": "16000000", "maxValue": "0"},
  "externalReview": {"status": "passed", "reportHash": "0x...", "reviewedCommit": "40-hex-commit"},
  "expiresAt": "2026-11-10T00:00:00.000Z"
}
```

Validation requires:

- `externalReview.status` exactly `passed`, a 32-byte report hash and a 40-character reviewed commit;
- `scope` contains `EXIT`;
- `maxGasPerRequest <= 8,000,000`;
- two or more RPC URLs;
- approval not expired and not future-dated;
- observed site/container/token/Vault match the approval at preflight.

## Run

```bash
bun scripts/m3-pilot.ts \
  --approval ./pilot-approval.json \
  --profile xlayer-196 \
  --rpc https://operator-a --rpc https://operator-b
```

Output is JSON with `ok`, approval summary, observed block/hash/holder/protection/Vault and check errors. Exit 1 on any failed check. The script does not authorize deployment; a human must still perform the approved wallet action.

## Boundary

The approval file is not a security review by itself. External review, explicit asset/费用 authorization, and a named pilot owner are prerequisites. An owner risk waiver (for local/test only) is **not** a valid external review and must not be used to pass `externalReview.status = "passed"`. Do not put private keys, passphrases or real user data in the approval file.
