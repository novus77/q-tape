# Guardian local-fork experiment

This is a verified feasibility experiment, not a production Vault. `HolderProbe` is intentionally unrestricted. No real assets or user keys belong in this laboratory.

## Setup

From the repository root:

```bash
bun install --frozen-lockfile
bun run bootstrap
```

Bootstrap obtains the pinned Solidity verifier, interface, forge-std and PQClean; compiles a reference Falcon signer; generates two fresh test-only keypairs. None of these keys are in the repository. Dependencies, binaries, test keys and newly generated results are git-ignored.

Start a loopback Anvil in a separate terminal:

```bash
anvil --fork-url https://rpc.xlayer.tech --fork-block-number 74818827 --chain-id 196 --host 127.0.0.1 --port 18545 --silent
```

Then from the repository root:

```bash
bun run check
bun run verify:fork
bun run verify:environment
bun run verify:e2e
bun run verify:summary
```

Or enter this directory and run `forge test --fork-url http://127.0.0.1:18545 -vv` for human-readable results. Solidity tests always run from this experiment directory, not the repository root.

Stop the temporary Anvil with Ctrl-C when finished.

## What is exercised

- X Layer block 74818827, chain 196, site `10.2.4.tape`, token 10.
- Real contract-to-Registry/Binding calls; old holder, Registry operator and NFT-approved identities.
- Real PQClean Falcon signatures and the pinned Solidity verifier.
- Signature mutation, wrong keys, request-field changes, batch ordering, nonce/expiry/domain boundaries, rotation, exit and batch rollback.
- Independently encoded JavaScript requests in actual local Anvil transactions, each Guardian transaction capped at 8M gas. The E2E tool only writes to the literal loopback endpoint and restores its snapshot.

The default development accounts may have EIP-7702 code in the fork; the successful exit fixture explicitly checks its recipient has no code.

## Evidence and limits

Historical reference output is in [evidence/2026-11-02](../../evidence/2026-11-02/README.md). Fresh output is written under this directory's `results/` and does not overwrite the archive.

The experiment uses the `Q-Tape lab Guardian v1` signing domain. The target product uses a different domain defined by [the spec](../../docs/SPEC-v0.1.md); product commands and production key management are not implemented here.

Renewal exercises a zero-fee snapshot. No public-chain transactions, full legacy-authorization enumeration, future-upgrade prevention, encrypted TapeSend compatibility or cryptographic audit is claimed. Source versions and trust boundaries are documented in [PROVENANCE](../../docs/PROVENANCE.md).
