# Release notes — 0.1.0-m1 (local MVP)

Date: 2026-11-02. Not a production release, not audited, not deployed to a public chain.

## Added

- `@qtape/schema`: RequestV1/SignedRequestV1/KeyBundleV1 validation; decimal uint256 and exact ABI hex rules.
- `@qtape/protocol`: formal request digest (`Q-Tape Guardian v1`), calls hash, KeyProof and backup-check encodings with independent fixed vectors.
- `contracts`: formal Guardian Vault with EXECUTE/EXIT/ROTATE_KEY, real Falcon verifier, KeyProof registration/rotation, no classic admin/approval/arbitrary-call path.
- `@qtape/signer`: native PQClean Falcon-512 process protocol, age v1 passphrase key bundle, backup recovery drill; secrets over stdin/stdout only.
- `@qtape/client`: TAP-10 site resolution, fixed-profile implementation checks, release planning/chunking/batching, simulation, submission and two-operator file readback verification.
- `@qtape/cli`: inspect, key create/verify-backup/rotate, vault prepare/deposit/exit, operator revoke, release plan/verify, request sign/submit.
- `@qtape/relayer`: idempotent SignedRequestV1 HTTP service, budget policy, persistent status records.
- `@qtape/web`: read-only protection status, wallet handoff for deployment/deposit, release verification view; no browser Falcon key.

## Verification

See [ACCEPTANCE.md](ACCEPTANCE.md). Current local results: experiment 21/21, formal contracts 48/48, signer 22/22, schema 10/10, protocol 13/13, client 7 unit + 11 fork, CLI 4, relayer 5, web 4; independent CLI lifecycle on fixed X Layer fork including relayer submission and clean checkout bootstrap.

## Known limitations

- Unaudited; mainnet and real-asset use prohibited until external review and explicit approval.
- Nonzero renewal fee, full legacy-authorization enumeration, TapeSend compatibility, browser Falcon signing, multisig recovery and production key custody not verified.
- Web browser EIP-1193 flow lacks automated DOM tests; relayer uses a single RPC.
- Fixed fork observations do not generalize to future external proxy upgrades.
