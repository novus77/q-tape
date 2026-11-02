# Q-Tape Key Management and Backup (M1)

Status: implementation notes for `@qtape/signer` (Task M1.3). This code has not
been independently audited. Do not use it for real user assets until the M2
security review and the M3 pilot approval described in
[SPEC-v0.1](SPEC-v0.1.md) have happened.

This document covers the local Falcon-512 key lifecycle: key generation, the
age v1 passphrase-encrypted key bundle, the native signer process protocol, and
the backup/recovery drill. It does not define the on-chain Vault interface or
the CLI UX; those live in Tasks M1.2 and M1.5.

## 1. Threat model

### Assets

- **Falcon-512 secret key** (1281 bytes). Possession allows signing Guardian
  requests and key-rotation/exit authorizations until the key is rotated or the
  Vault exits.
- **Backup passphrase.** Together with a copied `.age` file it reconstructs the
  secret key.
- **Decrypted key bundle in process memory.** It necessarily exists while the
  native signer is signing.

### Adversaries and assumptions

- **Remote attacker / server compromise:** cannot obtain the key from Q-Tape
  servers, CI, the relayer, or the browser. The secret exists only on the user's
  local signing machine and inside the native signer process while signing. The
  relayer never receives private key material.
- **Local file thief:** can steal the `guardian-key.age` file, but must recover
  the passphrase. The file uses authenticated encryption with an scrypt-derived
  key; the passphrase must be unique, random, and stored separately from every
  copy of the file.
- **Backup tampering:** modifying the `.age` file, replacing the ciphertext, or
  swapping in a different key bundle is detected by age authentication and by
  native Falcon verification. A public-key fingerprint alone is never accepted
  as proof of the decrypted content.
- **Malware, root, or physical access to the signing machine:** out of scope.
  Such an attacker can read process memory, stdin, keystrokes, or the passphrase
  while it is typed.
- **Supply-chain attacker:** mitigated by pinning PQClean and `age-encryption`
  to exact revisions, building from vendored source, and checking the checkout
  revision during bootstrap. This is a pin, not a guarantee that the upstream
  code is free of defects.
- **Operational loss:** losing the passphrase, the `.age` file, or all copies of
  both means losing the ability to sign. There is no classic ECDSA fallback and
  MVP does not promise social recovery.

### Explicit non-goals

- No browser-based Falcon signing in M1. The web/client runtime must not hold a
  secret key or attempt to implement Falcon in JavaScript.
- No multi-signature, threshold, or social recovery.
- No HSM, secure enclave, or hardware-wallet integration.
- No claim of side-channel or fault-injection resistance; this is not an
  audited production cryptography module.

## 2. Algorithms and formats

### Falcon-512

- Algorithm profile: `falcon-512-pqclean-round3-v1.2`.
- Implementation: unmodified PQClean Falcon-512 "clean" C sources at commit
  `0586a824fc0d49df0b6b6e9179d8d15d06d0974f` (Falcon round-3 v1.2 byte format).
- Public key: 897 bytes, first byte `0x09`.
- Secret key: 1281 bytes, first byte `0x59`.
- Signature: compressed Falcon format, at most 752 bytes. Padded signatures are
  not produced or accepted by the Q-Tape native signer.
- Signing operates on the **32 raw digest bytes**. It never signs a hex string,
  never applies EIP-191/personal-sign, and never re-hashes in the signer.

### KeyBundle V1

The decrypted payload is exactly this JSON object:

```json
{
  "schema": "qtape.keybundle.v1",
  "algorithm": "falcon-512-pqclean-round3-v1.2",
  "publicKey": "0x09...",
  "secretKey": "<base64 of 1281 bytes>",
  "createdAt": "2026-11-02T00:00:00.000Z"
}
```

`publicKey` is lowercase `0x` hex. `secretKey` is canonical base64. `createdAt`
is a UTC ISO 8601 timestamp normalized to `Date#toISOString()`. Unknown fields
are rejected by `parseKeyBundleV1` in `@qtape/schema`.

The public-key fingerprint is `keccak256(publicKey bytes)` rendered as `0x`
hex. It is a display/identifier value only; it does not replace decrypting the
bundle and checking the actual public key.

### age v1 passphrase format

- Pinned tool: `age-encryption@0.3.1` (the `typage` implementation by
  FiloSottile), a direct dependency of `@qtape/signer`.
- Format: binary age v1, **passphrase mode only**. The file starts with
  `age-encryption.org/v1` and contains one `scrypt` stanza.
- Default scrypt work factor is `logN = 18` (the age default). `createKeyBundle`
  and `writeKeyBundle` use that default. The `scryptWorkFactor` option exists
  only so tests can run quickly; production backups must not lower it.
- Encryption: age's ChaCha20-Poly1305 STREAM, with header authentication. The
  entire bundle, including the schema and algorithm fields, is inside the
  authenticated ciphertext.
- The file extension is `.age`. `writeKeyBundle` sets mode `0600`.
- The passphrase is independent from any old wallet key, seed phrase, or ECDSA
  private key. It must not be derived from them. Use a password manager; for
  real assets use at least 5 random words or an equivalent high-entropy secret.

The format is exactly the standard age passphrase file format. A file produced
by `@qtape/signer` can be decrypted by a compatible age v1 passphrase tool, and
a standard age v1 passphrase file containing a valid `KeyBundleV1` can be read
by `readKeyBundle`.

## 3. Native signer protocol

The executable is built by `packages/signer/scripts/bootstrap.sh` at
`packages/signer/bin/qtape-falcon` and is git-ignored. It uses a deterministic
binary protocol on stdin/stdout; all integers are unsigned 32-bit big-endian.

### `keygen`

```
stdin : empty
stdout: u32be publicKeyLen | publicKey (897)
        u32be secretKeyLen | secretKey (1281)
```

### `sign`

```
stdin : u32be secretKeyLen | secretKey (1281) | 32-byte digest
stdout: u32be signatureLen | signature (1..752)
```

Before writing anything to stdout, the signer derives the public key from the
secret key and verifies the fresh signature against it. A failed self-check
produces no signature bytes.

### `verify`

```
stdin : u32be publicKeyLen | publicKey (897)
        u32be messageLen   | message
        u32be signatureLen | signature
stdout: 0x01 (valid) or 0x00 (invalid)
```

### Process contract and secrecy

- Mode is the only argv value. Secret keys, passphrases, and digests never
  appear in argv or environment variables.
- Input is read from stdin only. There are no plaintext temporary files.
- All length fields are checked strictly: public key must be 897 bytes, secret
  key 1281 bytes, digest 32 bytes, signature 1..752 bytes, and trailing input is
  rejected.
- Diagnostics are fixed static strings on stderr and never include key bytes,
  digest bytes, or passphrase text.
- Exit codes: `0` success/verified; `2` invalid input or verification failure;
  `1` unexpected internal failure.
- `Q_TAPE_SIGNER_BIN` is a test/CI override only. Application code should pass
  the `binaryPath` option where needed; the default resolves relative to the
  package, not the current working directory.

### Build pin and platform support

`bootstrap.sh` clones only `crypto_sign/falcon-512/clean` and `common` from
PQClean at the pinned commit, verifies the commit hash, and compiles with
`clang -O2`. It is idempotent: a second run reuses the checkout and skips
recompilation when the binary is newer than all sources. macOS and Linux with
clang are supported; Windows is untested.

Tool versions used for the M1.3 verification: Bun 1.3.10, Apple clang 17.0.0
(clang-1700.0.13.5) on macOS arm64, and `age-encryption` 0.3.1. Licenses:
`age-encryption` is BSD-3-Clause; the Falcon implementation is MIT-licensed and
its text is included at
`packages/signer/vendor/PQClean/crypto_sign/falcon-512/clean/LICENSE` after
bootstrap; PQClean `common` files are public domain or MIT, and the remaining
PQClean repository is CC0.

## 4. Exact commands

Bootstrap (from the repository root):

```bash
bash packages/signer/scripts/bootstrap.sh
# or, as part of the full repository bootstrap:
bun run bootstrap
```

Test and typecheck:

```bash
cd packages/signer
bun test
bun run typecheck
```

The test suite is real-process and real-encryption; it requires the native
binary from bootstrap. It does not use mocks or an always-true verifier.

Example: create an encrypted backup and print its fingerprint. The passphrase is
read from a pipe, not from argv or an exported environment variable:

```bash
cd packages/signer
read -r -s -p "Backup passphrase: " QTAPE_BACKUP_PASS
printf '%s' "$QTAPE_BACKUP_PASS" | bun -e '
import { createKeyBundle, writeKeyBundle } from "./src/index.ts";
const passphrase = (await Bun.stdin.text()).trim();
const { bundle, fileBytes, publicKeyFingerprint } = await createKeyBundle(passphrase);
await writeKeyBundle("./guardian-key.age", bundle, passphrase);
console.log(JSON.stringify({ publicKeyFingerprint, fileBytes: fileBytes.length }));
'
unset QTAPE_BACKUP_PASS
```

Example: run the backup check against an existing `.age` file:

```bash
cd packages/signer
read -r -s -p "Backup passphrase: " QTAPE_BACKUP_PASS
printf '%s' "$QTAPE_BACKUP_PASS" | bun -e '
import { verifyBackup } from "./src/index.ts";
const passphrase = (await Bun.stdin.text()).trim();
const result = await verifyBackup({
  path: "./guardian-key.age",
  passphrase,
  challenge: "0x" + "ab".repeat(32),
});
console.log(JSON.stringify(result));
'
unset QTAPE_BACKUP_PASS
```

`verifyBackup` returns:

```json
{
  "publicKey": "0x09...",
  "fingerprint": "0x...",
  "challenge": "0x...",
  "digest": "0x...",
  "verified": true
}
```

The `verified: true` value is only returned after the native signer produced a
Falcon signature over the backup-check digest and the native verifier accepted
it with the bundle public key. It is not a placeholder flag.

## 5. Backup and recovery drill

Perform this drill before preparing a Vault, before the first NFT deposit, and
after replacing a signing machine or a backup copy.

1. **Create on a trusted local machine.** Generate the key bundle with
   `createKeyBundle(passphrase)`. Record the returned public-key fingerprint in
   a separate location (paper, second device, or password-manager note).
2. **Store the passphrase separately.** Never put the passphrase in the same
   folder, repository, cloud drive, or backup archive as the `.age` file.
3. **Make at least two independent copies** of the `.age` file on separate
   media/locations. A file-transfer checksum (SHA-256) helps detect transport
   damage, but the age authentication tag and native verification are the
   real integrity checks.
4. **Restore on a different machine.** In a fresh checkout run
   `bash packages/signer/scripts/bootstrap.sh`, then `readKeyBundle(path,
   passphrase)` and `verifyBackup({ path, passphrase, challenge })` with a
   fresh 32-byte challenge. The recovered `publicKey` and `fingerprint` must
   match the values recorded at creation, and `verifyBackup` must return
   `verified: true`.
5. **Compare out of band.** Compare the fingerprint against the separately
   recorded value. Do not trust a fingerprint printed by the same untrusted
   copy you are trying to verify.
6. **Only then continue** to Vault preparation, KeyProof registration, or NFT
   deposit.
7. If any step fails, stop. Restore the other copy, re-check the passphrase
   source, and repeat the drill. Do not overwrite existing backups during a
   failed drill.

**A failed backup verification blocks NFT deposit.** The deposit path must
treat these errors as hard stops: `INVALID_PASSPHRASE`, `CORRUPT_BUNDLE`,
`INVALID_KEY_BUNDLE`, `SIGNER_UNAVAILABLE`, `SIGNER_FAILED`, and
`BACKUP_VERIFICATION_FAILED`. A backup that cannot be decrypted and verified
with the native signer must never be treated as a usable backup, even if the
file name or a displayed fingerprint looks correct. Task M1.5's CLI must map
this failure to `BACKUP_VERIFICATION_FAILED` and refuse to continue the NFT
migration flow.

## 6. Error codes

| Code | Meaning | Required reaction |
|---|---|---|
| `INVALID_PASSPHRASE` | The passphrase did not unwrap the age file key. | Re-enter passphrase from the independent source; do not retry silently. |
| `CORRUPT_BUNDLE` | File is missing, not an age v1 file, truncated, or failed authentication/UTF-8/JSON parsing. | Restore another copy; treat the current file as damaged. |
| `INVALID_KEY_BUNDLE` | Decrypted JSON is valid but has wrong schema, algorithm, fields, or key lengths. | Do not use; regenerate from a verified backup or original generation step. |
| `SIGNER_UNAVAILABLE` | Native binary is missing or cannot be executed. | Run bootstrap; verify the path and platform. |
| `SIGNER_FAILED` | Native process failed, signature framing invalid, or key material rejected by Falcon. | Stop; inspect installation; never fall back to a different verifier. |
| `VERIFICATION_FAILED` | Verification input malformed (challenge, message, signature) or helper-level check failed. | Correct the caller input; do not treat as success. |
| `BACKUP_VERIFICATION_FAILED` | The backup check signature did not verify with the bundle public key, or the recovered key does not match. | **Block NFT deposit.** Restore from another backup and repeat the drill. |

## 7. Limitations

- **No browser Falcon signing.** M1 signing requires the local native process.
  The browser/client may construct requests but must not hold secret keys.
- **No multi-signature or social recovery.** One Falcon key controls the Vault
  for a given configuration. There is no classic-key fallback and no recovery
  committee.
- **No audit.** PQClean is a reference implementation and this integration has
  not been reviewed by an independent cryptography or application-security
  team. Treat the code as M1 infrastructure, not audited custody software.
- **No HSM or secure enclave.** The decrypted secret and passphrase exist in
  process memory while signing.
- **Passphrase-only age encryption.** Recipient/identity mode is not used for
  key bundles.
- **Padded Falcon signatures are not accepted.** Only the compressed
  round-3 v1.2 signature format is produced and verified.
- **Platform scope.** macOS and Linux with clang are supported and tested in
  this repository; other platforms are unverified.
- **No timing/side-channel validation.** Do not claim constant-time behavior
  without a dedicated review.
