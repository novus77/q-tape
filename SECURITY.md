# Security status

Q-Tape currently contains a development specification and local-fork experiments. There is no audited production Vault release or official production deployment.

Do not transfer real NFTs or other assets into `HolderProbe` or `GuardianLab`. `HolderProbe` intentionally permits unrestricted calls to characterize the external protocol.

The pinned Falcon Solidity dependency implements Falcon round-3 formats and is unaudited. Successful integration tests do not certify its cryptographic implementation or final FN-DSA compatibility.

## Scope of current evidence

The evidence concerns one X Layer snapshot, one circuit/Container and explicit authorization cases. It does not prove that every legacy authorization is cleared or constrain future changes to external proxy contracts.

Nonzero renewal fees, TapeSend encrypted-message compatibility, production key storage, PQ recovery and browser signing remain open product work.

## Reporting

For experimental behavior or test gaps, open an issue with a reproducible local case and omit keys or private data. For a potential exploit involving deployed third-party contracts or sensitive information, use GitHub private vulnerability reporting if enabled; do not publish exploitable details before coordination.

The [specification](docs/SPEC-v0.1.md) defines the intended threat model and release gates. Public-chain actions are not part of the reproduction scripts.
