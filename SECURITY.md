# Security status

Q-Tape now contains a locally verified MVP (formal Vault contracts, schema/protocol encoders, native Falcon signer, age-encrypted backups, Client SDK, CLI, relayer and read-mostly Web). **No security audit has been completed and no production deployment exists.** Do not transfer real NFTs or other assets into these contracts.

`HolderProbe` and `GuardianLab` under `experiments/guardian-fork` are experimental. `HolderProbe` intentionally permits unrestricted calls; neither contract may be used as a production Vault.

The pinned Falcon Solidity dependency implements Falcon round-3 formats and is unaudited. Successful integration tests do not certify its cryptographic implementation or final FN-DSA compatibility.

## Scope of current evidence

The evidence concerns one X Layer snapshot, one circuit/Container and explicit authorization cases. It does not prove that every legacy authorization is cleared or constrain future changes to external proxy contracts.

The local MVP lifecycle test runs entirely against loopback Anvil. It is not a public-chain deployment, not a mainnet fee quote, and not a substitute for an independent review. Nonzero renewal fees, TapeSend encrypted-message compatibility, browser Falcon signing, multi-signature recovery and production key custody remain open product work.

## Known residual risks

- The formal `Guardian.sol` and the request/KeyProof protocol have only internal review; external review is pending.
- The relayer currently relies on a single RPC endpoint for its own simulation; production operators should add independent-operator agreement.
- The Web interface has view-model/server tests but no automated browser-level EIP-1193 test.
- The fixed-profile client fails closed on unknown implementations, but client monitoring cannot prevent an external protocol admin from rewriting an upgradeable Registry.

## Reporting

For experimental behavior or test gaps, open an issue with a reproducible local case and omit keys or private data. For a potential exploit involving deployed third-party contracts or sensitive information, use GitHub private vulnerability reporting if enabled; do not publish exploitable details before coordination.

The [specification](docs/SPEC-v0.1.md) defines the intended threat model and release gates. Public-chain actions are not part of the reproduction scripts.
