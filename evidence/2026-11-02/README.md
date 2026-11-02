# Historical verification evidence — 2026-11-02

These files archive a completed local-fork experiment. They are reference observations, not live status or public-chain receipts.

- `environment.json`: X Layer block 74818827, contract implementations/code fingerprints and source pins.
- `final-tests.json`: 21 passing Foundry cases with decoded logs.
- `summary.json`: 6 protocol cases, 15 Guardian cases and the independent transaction summary.
- `e2e-transactions.json`: the final successful run of 8 local Anvil transactions, including 5 behavior cases. The snapshot was restored.

Public-chain transaction broadcasts: **0**. Hashes for the local transactions cannot be resolved on a public explorer.

The archive predates standalone repository packaging. Its public-key/signature lengths and gas can differ from a fresh run because local test keys and signatures are newly generated. Original test keys are not included.

See [verification report](../../docs/VERIFICATION.md) and [reproduction instructions](../../experiments/guardian-fork/README.md).
