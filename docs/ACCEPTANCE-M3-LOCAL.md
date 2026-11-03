# M3 Local Acceptance Record

Date: 2026-11-03. Scope: local/test environment only; external independent review waived by owner (see [RISK-WAIVER-2026-11-03.md](RISK-WAIVER-2026-11-03.md)). No public-chain transaction, real NFT or real user key.

| Verification | Command | Result |
|---|---|---|
| Repository check | `bun run check` | `check: OK`; all workspace typechecks and unit tests pass |
| M1/M2 regression | `bun run test:fork` | 21 experiment + 59 formal contract + 18 client tests passed; M1 E2E OK |
| M2 local lifecycle | `bun run m2:e2e` | Vite build → plan → sign → submit → same-block readback `VERIFIED` → renewal → rotate → exit; relayer metrics/monitor probe OK |
| M3.3 self-hosted fixture | `bun run test:m3` | fixture deploy → Guardian predicted address → `PROTECTED` → publish/readback → nonzero renewal → rotate → exit; preflight checks OK |
| Review package | `bun run review:package` | 170 tracked files, manifest and archive SHA-256 generated |

## Status

- **Local/test development: available.**
- **M3.2 external review: waived by owner, not completed.**
- **M3.4 mainnet pilot: blocked.**
- **M3.5 real pilot report: not applicable until an authorized pilot.**

This record must not be used as an audit, production deployment or official protocol compatibility claim.
