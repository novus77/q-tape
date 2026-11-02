# Standalone repository verification — 2026-11-02

This archive records the independent repository rerun with fresh local Falcon test keys, repository-local dependencies and the pinned public forge-std v1.17.0 checkout.

- `environment.json`: fixed X Layer fork at block 74818827, implementation fingerprints and source pins.
- `final-tests.json`: all 21 Foundry cases passed (6 protocol, 15 Guardian).
- `e2e-transactions.json`: 8 actual local Anvil transactions covering 5 behavior cases; snapshot restored; no public-chain broadcasts.
- `summary.json`: machine-readable aggregate of those results.

The valid publication used **3,290,735 gas**; the valid NFT exit used **3,038,459 gas**. Both were executed with an 8,000,000 gas transaction cap. These are sample measurements, not a production gas guarantee. Fresh keys and signatures can change verification cost.

Local transaction hashes are not public-chain receipts. No test secrets are included. The [earlier archive](../2026-11-02/README.md) remains unchanged for comparison.

See [reproduction instructions](../../experiments/guardian-fork/README.md), [source provenance](../../docs/PROVENANCE.md) and [verification scope](../../docs/VERIFICATION.md).
