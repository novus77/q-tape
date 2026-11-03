# Owner Risk Waiver — Local/Test Environment Only

Date: 2026-11-03 (Asia/Shanghai). Decision owner: project owner (explicit session instruction).

## Decision

The project owner has chosen **not to initiate an independent external security review at this time**. Development may continue **only in local and test environments** under the restrictions below.

This waiver is **not** an audit, not an independent review, and must not be represented as either.

## Scope of what remains permitted

- local Anvil, local fork and self-hosted fixture drills;
- test keys and test assets only;
- SDK/CLI/relayer/Web local tests and documentation;
- internal static checks, fuzz/invariant tests and threat-model maintenance.

## Prohibited while this waiver is in effect

- any public-chain transaction or mainnet deployment;
- any real NFT migration, real user Falcon key, real backup passphrase or real funds;
- claiming "audited", "production-ready", "officially compatible" or "mainnet pilot approved";
- M3.4 mainnet pilot or M3.5 real-pilot acceptance;
- using an owner waiver as a substitute for the `externalReview.status = "passed"` requirement in `qtape.pilot-approval.v1`.

## Re-evaluation

The owner must explicitly replace this waiver with an external review report bound to a commit and archive hash before any real-asset or public-chain activity. If the project later seeks external review, the prepared package/process in `docs/EXTERNAL-REVIEW-REQUEST.md` remains available.

## Residual risk statement

Without independent review, unknown vulnerabilities may remain in the formal Guardian, protocol encoding, native signer, age backup, relayer and Web boundaries. local tests, fuzzing and internal review reduce but do not eliminate this risk.
