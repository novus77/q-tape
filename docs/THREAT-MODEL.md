# Q-Tape Threat Model (M2)

Status: M2.1 internal review artifact. This is not an independent security audit. The authoritative product requirements are [SPEC-v0.1.md](SPEC-v0.1.md); M1 evidence is in [ACCEPTANCE.md](ACCEPTANCE.md).

## 1. Assets

| Asset | Why it matters |
|---|---|
| Circuit NFT and its Container/site | Controls the DeWEB website namespace and file records |
| Falcon-512 secret key | Authorizes every EXECUTE, EXIT and ROTATE_KEY request |
| Encrypted key bundle + passphrase | Reconstructs the Falcon key; loss means no classic fallback |
| Decrypted key in signing process | Temporarily exists while the native signer signs |
| Relayer gas funds | Can be spent by the relayer service; not authority over the NFT |

## 2. Trust boundaries

```
local signer process  --SignedRequestV1-->  user wallet or relayer  -->  Guardian --> external protocols
        ^                         ^                                        |
        |                         |                                        |
  age backup file          no Falcon key                          Circuit NFT / Container
```

- The local signer is the only component allowed to hold Falcon secret material.
- Client SDK and Web may construct/display requests but never load a Falcon key.
- Relayer never receives a Falcon key or backup passphrase; it may receive and relay a signed request unchanged.
- Guardian trusts only its immutable configuration and the configured Falcon verifier; it does not trust a server, relayer or caller identity.

## 3. Adversaries and required behavior

### 3.1 Legacy ECDSA owner / operator compromise

- Old NFT owner, pre-transfer Registry operator and old NFT approvals must not be able to write files, renew, set fallback, transfer the NFT or create a new operator authorization through the Vault.
- M1 fork tests cover the tested snapshot; full historical-authorization enumeration remains unproven.

### 3.2 Relayer / publishing service compromise

- The relayer can see signed requests but not the key; it can refuse service or censor but not create a new authorization.
- It must not modify, split, reorder or re-sign the request. Same digest returns the previous status; unknown broadcasts are not blindly retried.
- If the relayer is malicious it can submit an already-signed request; this is equivalent to any user broadcasting the same valid request.

### 3.3 Network / RPC adversary

- Client protection and release verification require two independent operators to agree on a block hash and reads; disagreement stops with `RPC_DISAGREEMENT`.
- A malicious RPC can withhold or lie, but two agreeing independent operators are required for a positive status. Local M2 tests use a proxy to one Anvil and cannot prove operator independence.

### 3.4 Signing host compromise

- Out of scope: malware, root, physical access, keyloggers and screen capture can read the passphrase or process memory. M2 does not implement HSM, secure enclave or multisig.
- Backup passphrase is independent of any wallet key; a stolen `.age` without the passphrase should not reveal the key (age authenticated encryption + scrypt).

### 3.5 External protocol administrator

- SiteRegistry and DomainBinding are upgradeable proxies. A protocol admin can change implementation semantics; the client fails closed when the implementation slot/code hash is not accepted, but chain-level prevention is impossible for a client.
- The Vault protects the NFT holder right; it does not make external protocol upgrades safe.

### 3.6 User-approved malicious content

- A valid Falcon signature proves the user authorized exact bytes, not that the content is benign. The CLI/UI must show paths, sizes, SHA-256, call list, amounts, nonce and expiry before unlocking the signer.

## 4. Security invariants

1. No state-changing Guardian entry point except `execute`; no owner/admin, upgrade, delegatecall, approval, arbitrary target or persistent operator path.
2. Every successful request consumes exactly the current nonce; a reverted batch restores nonce and all external effects.
3. Digest binds domain, chain ID, Vault address, operation, ordered calls hash, nonce and expiry; Falcon signs the 32 raw digest bytes.
4. Key registration and rotation require a KeyProof signed by the *new* key; the old key cannot rotate to an unproven key.
5. EXIT only transfers the bound NFT with three-argument `safeTransferFrom` to a non-zero recipient.
6. Files are read back as bytes and verified against size + SHA-256 + manifest; a successful transaction is not by itself a verified release.
7. Falcon private material never enters argv, environment variables, relayer, CI, browser, logs or plaintext temporary files.
8. Backup verification failure blocks NFT deposit.

## 5. Residual risk register

| ID | Risk | Current mitigation | Residual |
|---|---|---|---|
| R-1 | Verifier is a constructor parameter; a direct SDK deployer could choose a malicious verifier | CLI and client profile pin `verifierCodeHash`; constructor checks code and real KeyProof | A third-party SDK deployer must verify the verifier artifact; contract cannot know a canonical list |
| R-2 | External proxies can be upgraded | Client checks ERC-1967 slot and accepted implementations; fail closed | No on-chain prevention of external admin upgrade |
| R-3 | Relayer uses one RPC for its own simulation | M2.1 documents; M2.2+ should add optional second operator | Not yet independently checked in production |
| R-4 | Nonzero renewal fee not exercised against real protocol | Explicitly labeled fixture tests | Real fee path remains unverified |
| R-5 | Browser wallet UI can be tricked by pasted prepared transaction | UI validates chain/to/data/value and displays expected address; deploy is user-confirmed | No hardware-wallet-grade display verification |
| R-6 | PQClean/fndsa cryptography unaudited | Pinned revisions, real vectors, native self-verification | No side-channel/final-FIPS-206 claim |
| R-7 | Full historical authorization enumeration not done | Tested fixed snapshot cases only | Unknown legacy grants possible outside tested paths |

## 6. External review handoff

Reviewers should receive:

- `contracts/src/Guardian.sol`, `contracts/src/interfaces/IProtocol.sol`
- `contracts/test/GuardianFork.t.sol`, `GuardianFeeFixture.t.sol`, `EncodingVectors.t.sol`
- `packages/schema/src`, `packages/protocol/src`
- `packages/signer/src`, `packages/signer/native/falcon_signer.c`
- `packages/client/src`, `apps/relayer/src`, `apps/web/src`
- `docs/THREAT-MODEL.md`, this document, `docs/SECURITY-REVIEW-PREP.md`
- Fixed provenance in `docs/PROVENANCE.md`

Reproduction:

```bash
bun install --frozen-lockfile
bun run bootstrap
bun run check
bun run test:fork
```

External review must independently assess the formal contract, protocol and key handling; M2 internal tests and this threat model do not substitute for it.
