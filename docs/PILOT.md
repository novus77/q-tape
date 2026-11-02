# M2 Pilot Runbook (draft)

Status: preparation for a design-partner trial, not a public deployment. No real assets or user keys in M2.

## Roles

- **Site owner:** builds the fixed site artifact, holds the circuit NFT currently, runs the local Q-Tape CLI/signer, approves exact requests.
- **Design partner / publishing tool:** produces the fixed artifact and calls the public SDK; never holds a Falcon key in CI.
- **Reviewer:** independent security reviewer for the formal Vault/protocol/signer dependencies; must sign off before any real-asset step.
- **Operator:** runs the optional relayer and RPC endpoints; supplies gas funds and monitoring, cannot authorize a request.
- **Observer:** reads status/verification evidence; no wallet required.

## Trial preconditions

1. M2 external security review findings closed or explicitly accepted; no unresolved critical/high issue.
2. M2 acceptance record and reproducibility evidence attached to the pilot commit.
3. Test/pilot chain profile fixed; implementation slots, processor code hash and verifier code hash recorded.
4. The participant uses a freshly generated Falcon key and completes an independent backup/restore drill on a second machine.
5. Test assets only: no production NFT, no real user Falcon key, no real funds beyond a deliberately funded test relayer.
6. Written scope: site name, NFT/tokenId/Container, allowed operations, time window, rollback/exit plan.

## Trial flow

1. **Inspect:** partner runs `qtape inspect <site>`; stop on `UNSUPPORTED`, `CONFIG_CHANGED`, `RPC_DISAGREEMENT`.
2. **Key:** generate encrypted bundle locally; record fingerprint out of band; recover on a second machine; `key verify-backup` must succeed.
3. **Prepare:** deploy an empty Vault with an ordinary wallet using `vault prepare`; verify predicted address, code hash, verifier code hash and parameters.
4. **Deposit:** `vault deposit` must refuse to output a transaction unless backup verification passed; ordinary wallet confirms the exact NFT/tokenId/Vault.
5. **Protect:** `inspect` must show `PROTECTED` with the observed block/range; `DEPOSITED_UNVERIFIED` is not sufficient.
6. **Publish:** partner's adapter produces a fixed artifact and ReleasePlan; user reviews diff/hash/calls/amounts/nonce/expiry and signs locally; submit unchanged through wallet or relayer.
7. **Verify:** `release verify` at one block reads length, raw bytes/SHA-256 and manifest from two operators; only then mark `VERIFIED`.
8. **Renew/rotate/exit:** repeat the same approval discipline. Exit is explicit and irreversible for protection; the user must understand the recipient and EIP-7702/code-account simulation.
9. **Debrief:** record friction, recovery failures, fee surprises, UX errors and any attempted bypass; file issues without keys or private data.

## Stop conditions

Stop and do not proceed on:

- external review not complete / critical finding open;
- backup recovery failure or passphrase uncertainty;
- unknown profile, changed implementation, code hash mismatch or RPC disagreement;
- protected status based only on transaction success, not byte-level readback;
- any tool asking for a Falcon private key in CI, browser, relayer, argv or environment;
- nonzero fee not understood or not covered by the signed amount.

## Success criteria

- End-to-end fixed-site publish and readback by a design partner without TapeCI/HashPort or manual ABI work.
- Backup recovery on a second machine verified with the native Falcon signer.
- No security bypass in the external review scope; residual risks documented.
- The user can explain and verify every asset/parameter in the flow.
- No public-chain transaction or real asset migration without separate written approval.
