# M2 Acceptance Record

Date: 2026-11-02. Branch: `m2-pilot` (based on `mvp-m1-build`). All evidence is local/fixed-fork and fixture-based unless explicitly stated.

**Status: M2 internal development and verification complete; external independent security review is not complete. M2 is a design-partner trial candidate, not a mainnet or real-asset release.**

## Actual commands and results

| Verification | Command | Result |
|---|---|---|
| Repository check | `bun run check` | `check: OK`；security review + 8 workspace typechecks + unit tests（schema 10、protocol 13、signer 23、client 14、CLI 6、adapter 2、relayer 7、web 11） |
| M1 experiment regression | `bun run test:fork` | 21/21 experiment tests |
| Client fork/unit | `bun run test:fork` | 18/18（14 unit + 4 fork） |
| Formal contracts | `cd contracts && forge test --fork-url http://127.0.0.1:18545` | **59/59** passed: 6 EncodingVectors + 42 Guardian + 3 fee fixture + 7 fuzz + 1 invariant |
| M2 static security guard | `bun run security:review` | `security-review: OK`; all six boundary checks pass |
| M2 focused suites | `bun run test:m2` | contract M2 suites 11/11（3 fee + 7 fuzz + 1 invariant）, Vite adapter 2/2, Web DOM 11/11 |
| M2 independent lifecycle | `bun run m2:e2e` | `MVP_E2E_OK`: actual `vite build` output → adapter → plan → sign → submit → same-block two-endpoint `VERIFIED` → renewal → refuel/rotate → exit |
| Clean checkout | `git clone` + `bun install --frozen-lockfile && bun run bootstrap && bun run check && bun run m2:e2e` | **通过**（2026-11-02，干净 clone，新测试密钥；M2 E2E exit 0） |

## M2.1 Security review

Internal review, threat model and handoff package: `docs/SECURITY-REVIEW-M2.md`, `docs/THREAT-MODEL.md`.

- No critical/high bypass found by internal review.
- Findings: verifier constructor parameter (mitigated by profile verifier code hash), external proxy upgrade assumption, single-RPC relayer (M2 adds optional second RPC), pasted prepare transaction confirmation, fixture-only nonzero fee, unaudited PQClean/fndsa.
- **External review: pending, not an audit conclusion.**

## M2.2 Fees and trial environment

- Real protocol: zero-fee renewal on the fixed X Layer fork passed in `m2:e2e`.
- Fixture: `GuardianFeeFixture.t.sol` covers nonzero fee, exact forwarding, fee change after signing, insufficient value and nonce rollback. It is **not** the official DomainBinding.
- `vault renew` reads `monthlyFee()` and signs the exact amount; months restricted to 1–120.
- Real nonzero fee path remains unverified; do not accept real fee-bearing assets yet.

## M2.3 Vite adapter

- `packages/adapter-vite` collects immutable `vite build` output, rejects symlinks/path escape and delegates planning to `@qtape/client`.
- `m2:e2e` actually runs `vite build` on `examples/vite-site` and consumes `dist/`: files `assets/index-*.css`, `assets/index-*.js`, `index.html` were read back and verified.
- This is a Vite adapter example, not an integration with TapeCI/HashPort.

## M2.4 UX and recovery

- `apps/web/src/app.ts` exposes `createApp`/`mountApp`; `apps/web/test/app.test.ts` uses happy-dom to exercise actual DOM states: successful/failed inspection, wrong chain, wrong wallet network, deposit handoff, RPC disagreement and tabs.
- `packages/signer/test/process-recovery.test.ts` recovers an age bundle in a fresh child process and verifies a fresh backup challenge.
- No browser Falcon private key or passphrase input exists.

## M2.5 Trial / release gate

- `docs/PILOT.md` defines roles, preconditions, flow, stop conditions and success criteria.
- `docs/RELEASE-NOTES-M2.md` records the M2 surface.
- `scripts/test-m2.sh` reproduces M2 focused suites and E2E.
- External review sign-off, real nonzero-fee evidence, and a design partner's written scope remain required before any pilot with real assets.

## Missing / not claimed

- External independent security review and sign-off.
- Public testnet or mainnet deployment; all transactions are loopback Anvil.
- Real nonzero renewal fee, full historical authorization enumeration, future proxy upgrades.
- Real browser wallet EIP-1193 E2E; happy-dom is component-level, not a real wallet.
- TapeSend compatibility, browser Falcon signing, multisig/social recovery.
- Production key custody and audit of PQClean/fndsa/age dependencies.

## Conclusion

M2 internal deliverables are implemented and locally verified. **Do not read this as an audit, public deployment or approval to migrate real assets.** The next external gate is independent review plus a written design-partner trial scope (M3 only after explicit approval).
