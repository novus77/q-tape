# Q-Tape formal contracts (M1.2)

`Guardian.sol` is the formal Q-Tape Vault contract for Task M1.2. It is an
independent implementation derived from the protocol requirements, **not** a
renamed `GuardianLab` and **not** an audited product. Do not use it with real
assets until an independent security review has been completed.

## What this package contains

| Path | Purpose |
|---|---|
| `src/Guardian.sol` | Fixed-parameter, PQ-only Vault with EXECUTE, EXIT and ROTATE_KEY |
| `src/interfaces/IProtocol.sol` | `CircuitNFT`, `Container`, `SiteRegistry` and `DomainBinding` interfaces |
| `test/EncodingVectors.t.sol` | Hardcoded independent request/KeyProof vectors copied from `packages/protocol/test/vectors/request-vectors.json` |
| `test/GuardianFork.t.sol` | Fork regression suite (ported GuardianLab cases plus constructor, boundary and security tests) |
| `scripts/bootstrap.sh` | Pinned dependency bootstrap, test signer build and local test-key generation |
| `tools/falcon_signer.c` | Test-only PQClean Falcon-512 keygen/sign helper |

All bootstrap output (`vendor/`, `bin/`, `out/`, `cache/`, `fixtures/`) is
git-ignored. The test keys are generated locally and must never be committed or
used for real assets.

## Bootstrap

Prerequisites: Bun 1.3.10, Foundry/forge/anvil 1.7.1, `clang`, and a local Anvil
X Layer fork on `http://127.0.0.1:18545` (chain 196, block 74818827).

```bash
bash contracts/scripts/bootstrap.sh
```

The script reuses the pinned vendor checkout under
`experiments/guardian-fork/vendor` when present, otherwise fetches the exact
pinned commits. It builds `contracts/bin/falcon-signer` and creates two fresh
test keypairs in `contracts/fixtures/`.

The Anvil fork must be running separately, for example:

```bash
anvil --fork-url https://rpc.xlayer.tech --fork-block-number 74818827 --chain-id 196 --host 127.0.0.1 --port 18545 --silent
```

## Test commands

Run from this directory:

```bash
cd contracts
forge fmt --check src test
forge test --fork-url http://127.0.0.1:18545 -vv
```

`EncodingVectors.t.sol` is also runnable without a fork, but the full suite is
intended to run against the fixed fork above.

## Contract summary

The constructor fixes the verifier, circuit NFT, token id, Container,
SiteRegistry, DomainBinding and canonical name hash. It checks:

- every fixed address has code;
- `Container.owner() == NFT.ownerOf(tokenId)`;
- the canonical name hash is non-zero;
- the initial Falcon-512 public key is 897 bytes with header `0x09`;
- a KeyProof binds the key to `address(this)`, the current chain and a
  caller-supplied 32-byte challenge, verified by the configured PQ verifier.

`execute` verifies a formal request digest over
`Q-Tape Guardian v1` (never the laboratory domain; `Q-Tape lab Guardian v1`
signatures are rejected), checks the current holder,
consumes the nonce before external calls, and enforces a reentrancy guard.
`EXECUTE` only permits `SiteRegistry.putFile`, `appendChunk`, `removeFile`,
`setFallback`, `setOperator` with TTL exactly zero (always the bound Container,
zero value), and `DomainBinding.bind` with the exact canonical name and bound
Container. All allowed calldata is decoded and re-encoded so trailing or
non-canonical bytes are rejected. `EXIT` permits exactly one three-argument
`safeTransferFrom` of the bound token from the Vault to a non-zero recipient.
`ROTATE_KEY` decodes `(bytes newKey, bytes32 challenge, bytes proof)`, verifies
the proof with the **new** key, stores the new key and emits `KeyRotated`; it
does not perform an external self-call.

There is no owner/admin, no fallback or receive function, no approval helper,
no arbitrary target, no delegatecall and no persistent operator authority.

## Security boundary

This contract protects against compromise of a legacy ECDSA owner/operator or a
relay service for actions routed through the Vault: those keys cannot move the
NFT or make a signed protocol call without a valid Falcon signature. It does
**not** protect against:

- theft or misuse of the Falcon secret key or signing host;
- a user intentionally signing a malicious request;
- compromise, upgrade or malicious behaviour of the external protocol contracts
  (CircuitNFT, Container, SiteRegistry, DomainBinding) or their administrators;
- chain consensus failure or future changes to Falcon/FIPS 206 formats;
- the external protocol's own fee, activation or permission rules.

A valid Falcon signature is not a guarantee that a receiver accepted the NFT;
receivers with code, including EIP-7702 accounts, must be simulated before an
EXIT. The tests use a fixed local fork and the live protocol implementation at
block 74818827; they are not evidence of mainnet deployment, user-key safety or
a completed audit. This code is **unaudited** and is not a production wallet.
