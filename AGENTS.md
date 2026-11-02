# Q-Tape repository instructions

- Read `docs/SPEC-v0.1.md` and distinguish verified PoC behavior from planned MVP behavior.
- Default branch is `dev`. New branches and worktrees start from `origin/dev`; PRs target `dev`. A fresh repository has its initial branch on `dev`.
- Branch names contain at most three hyphen-separated words, without slashes or type prefixes.
- Use conventional commit messages: `feat`, `fix`, `docs`, `chore`, `refactor`, or `test`.
- Do not commit keys, generated fixtures, node_modules, dependency checkouts, local transaction results, caches or compiled binaries. Versioned historical reference evidence lives only under `evidence/`.
- HolderProbe and GuardianLab are experimental. Do not promote them to production by renaming or removing warnings.
- The supplied transaction experiment is loopback-only. Public-chain deployment, real NFT migration or user-key use require a separate explicit request.
- Run tests from `experiments/guardian-fork`; root Bun scripts change to that directory for you. `bun run check` is the repository check.
- Use real Falcon signer/verifier integration for authorization tests; never an always-true verifier.
- Unknown input is validated once at its owning boundary. Avoid `any`, import aliases and star imports in new TypeScript.
- Future client runtime may depend on schema and protocol, never on a server implementation. Keep signing separate from relay execution; no private key in relayer or CI.
- No Changesets. Initial repository is a specification plus verified experiment, not an announced stable release.
