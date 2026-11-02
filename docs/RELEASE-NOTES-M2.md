# Q-Tape M2 Release Notes (candidate)

Status: internal M2 candidate; unaudited, local-only evidence, no public-chain deployment.

## Added

- **M2.1**: static security guard, Foundry fuzz/invariant suites, threat model and external-review handoff.
- **M2.2**: renewal quote/call helpers, `qtape vault renew`, nonzero fee fixture tests, fee/pilot documentation.
- **M2.3**: `@qtape/adapter-vite` for real Vite `dist/` output, with symlink/path-escape rejection and actual `vite build` E2E.
- **M2.4**: testable `mountApp` Web component with happy-dom tests, independent-process age recovery test and UX contract.
- **M2.5**: `scripts/test-m2.sh`, `m2:e2e`, pilot runbook and this acceptance record.

## Verification

- `bun run check`: OK.
- Formal contracts: 59/59.
- M2 focused suites: contract 11/11, adapter 2/2, Web DOM 11/11.
- `bun run m2:e2e`: actual Vite build → plan → sign → submit → same-block two-endpoint readback `VERIFIED`; renewal, relayer rotation and exit completed locally.

## Not included

- Independent security audit/sign-off.
- Public testnet/mainnet deployment or real NFT migration.
- Real nonzero-fee protocol validation; fixture only.
- Browser wallet EIP-1193 real-wallet E2E; happy-dom only.
- TapeSend compatibility, browser Falcon signing, multisig/social recovery.

See `docs/ACCEPTANCE-M2.md`, `docs/SECURITY-REVIEW-M2.md`, `docs/PILOT.md`.
