# Renewal and Fee Boundary (M2)

Q-Tape renews a site by calling `DomainBinding.bind(name, container, months)` through a Falcon-signed `EXECUTE` request. The amount is part of the signed calls array and is forwarded exactly.

## Rules

- `months` is 1–120 for this MVP. `monthlyFee` is read from the current chain at the latest observed block; the total is `monthlyFee × months`.
- The user sees the quote (name, container, fee, months, total, block) before signing. The request binds the exact `value`; a fee change after signing makes the binding call revert, and the user must re-quote and re-sign.
- Existing zero-fee snapshots are real-protocol observations only; they do not prove nonzero-fee behavior.
- `GuardianFeeFixture.t.sol` is an explicitly labeled fixture for nonzero/fee-change arithmetic and rollback. It is not the deployed `DomainBinding` and must not be cited as official protocol compatibility.
- A future test/pilot environment with a real nonzero fee requires separate configuration and evidence; do not silently substitute a fixture.

## CLI

```bash
qtape vault renew --vault 0xVault --name 10.2.4.tape --months 1 \
  --key ~/.qtape/old.age --rpc https://rpc.xlayer.tech --out renew.json
qtape request submit renew.json --relayer http://127.0.0.1:8787
# or qtape request submit renew.json --json for an unsigned ordinary-wallet transaction
```

`vault renew` reads `monthlyFee()` and computes the exact total; it refuses months outside 1–120. The CLI output includes the quote and digest so the user can compare before signing.

## Status

- Zero-fee real snapshot: tested in M1.
- Nonzero fee / fee change / insufficient value: tested against `GuardianFeeFixture` only.
- Official nonzero-fee testnet or mainnet path: not verified in M2.
