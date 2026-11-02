# M2.1 Security Review Record

Status: **internal review preparation only — external independent review is not complete.** Date: 2026-11-02. Branch: `m2-pilot`. Do not describe this document as an audit.

## Scope

- `contracts/src/Guardian.sol` and `contracts/src/interfaces/IProtocol.sol`
- `packages/schema/src`, `packages/protocol/src`
- `packages/signer/src`, `packages/signer/native/falcon_signer.c`
- `packages/client/src`, `apps/relayer/src`, `apps/web/src`
- Pinned dependencies in `docs/PROVENANCE.md`

## Method

1. Read M1 specification/review boundaries and the M1 acceptance record.
2. Run `bun run check`, `bun run test:fork`, `forge test`, and the M2 static guard (`bun run security:review`).
3. Adversarial review of Guardian entry points, calldata canonicalization, nonce/expiry/value handling, KeyProof/rotation, signature-domain separation, key storage and relayer idempotency.
4. Add fuzz/invariant coverage for invalid nonce/expiry/operation/value/malformed signatures and failed-batch nonce rollback.
5. Record findings and residual risk in `docs/THREAT-MODEL.md`.

## Findings

| ID | Severity | Finding | Resolution / status |
|---|---|---|---|
| M2-F1 | Medium | `verifier` is constructor-supplied; a direct SDK deployer could deploy with a malicious or unrelated verifier. | Mitigated in client/CLI by fixed profile `verifierCodeHash`; constructor verifies a real KeyProof and code existence. External reviewer should assess whether a canonical verifier allowlist belongs in the contract or deployment profile. Residual R-1. |
| M2-F2 | Medium | External `SiteRegistry`/`DomainBinding` are upgradeable proxies; client code-hash pinning detects a change but cannot stop an admin rewrite. | Fail-closed client checks; documented external-protocol assumption. Residual R-2. |
| M2-F3 | Medium | Relayer currently configures one RPC for its own simulation; a compromised RPC could cause bad simulation/submission decisions. | M2.2 adds optional second-operator agreement (see plan); until then test/trial must use a trusted local RPC. Residual R-3. |
| M2-F4 | Low | Pasted deployment transaction in Web relies on the user checking `expectedAddress`; no hardware display. | Validates chain/to/data/value, shows expected address, never handles Falcon keys. Residual R-5. |
| M2-F5 | Low | Nonzero real-protocol renewal fee is untested; only a fixture exercises fee changes. | Explicit fixture `GuardianFeeFixture.t.sol`; real-fee claim remains open. Residual R-4. |
| M2-F6 | Info | PQClean/fndsa-solidity are unaudited dependencies. | Pinned, isolated and exercised with real vectors; no security guarantee. Residual R-6. |

No critical or high-severity bypass was found in the internal review. This is not proof of absence and does not satisfy the M2 external-review gate.

## Tests added in M2.1

- `contracts/test/GuardianFuzz.t.sol` — fuzz invalid nonce, expiry, operation, value and malformed signatures; asserts nonce/state remain unchanged.
- `contracts/test/GuardianInvariant.t.sol` — invariant-style checks for nonce behavior after failed batches.
- `scripts/security-review.ts` — static fail-closed source guard for forbidden Guardian primitives, function surface, domain separation, key boundaries and review-status documentation.
- `bun run security:review` in `package.json`.

## External review handoff checklist

- [ ] Repository commit/tag fixed and reproducible
- [ ] `bun install --frozen-lockfile && bun run bootstrap` completes
- [ ] `bun run check` and `bun run test:fork` evidence attached
- [ ] Reviewer receives threat model, M1 acceptance and provenance pins
- [ ] Reviewer confirms Guardian/protocol/signer scope and out-of-scope items
- [ ] Findings triaged with severity, owner and fix evidence
- [ ] Independent sign-off recorded before pilot or real-asset approval

**Gate status: external review pending.**
