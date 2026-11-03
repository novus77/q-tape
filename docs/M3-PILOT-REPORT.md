# M3 Pilot Report Builder

`scripts/m3-report.ts` turns a local fixture result into a structured `qtape.pilot-report.v1` JSON record.

```bash
bun scripts/m3-report.ts \
  --result experiments/guardian-fork/results/m3-fixture/result.json \
  --approval ./pilot-approval.json \
  --out pilot-report.json
```

The builder requires:

- `fixtureOnly: true` and `publicChainTransactionsBroadcast: 0`;
- a `release-verified` record with files all `ok`;
- steps for deposit/protection, release verification, key rotation and exit;
- optional approval metadata: approver, external review report hash/commit, expiry.

It produces `status: LOCAL_VERIFIED` only when all checks pass. Otherwise `INCOMPLETE` and an error list. The report is explicitly limited to local fixture evidence; it is not an audit, official protocol proof or mainnet deployment record.
