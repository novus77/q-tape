# External Review Outreach

Use this after selecting a reviewer from [REVIEWER-SHORTLIST.md](REVIEWER-SHORTLIST.md). Attach the generated review package and manifest; do not attach keys or local results.

## Email template

Subject: Q-Tape M3.2 independent security review request — commit `<commit>`

Hello `<reviewer>`,

We would like a fixed-scope, independent security review of Q-Tape, a post-quantum publishing-authority Vault for TapeOut DeWEB sites.

- Repository: https://github.com/novus77/q-tape
- Reviewed commit: `<commit>`
- Review package: `qtape-m3-review.tar.gz`
- Archive SHA-256: `<sha256>`
- Scope: Solidity Guardian, schema/protocol request encoding, native Falcon signer + age backup, Client SDK, relayer and Web key boundaries.
- Out of scope: external TapeOut proxy upgrades, mainnet deployment and real asset custody; a dependency-risk review of PQClean/fndsa is requested.
- Requested deliverables: report bound to commit/archive hash, severity/evidence/remediation, and a fixed-version re-test addendum.

Please confirm:
1. availability and proposed lead reviewer;
2. any conflict of interest;
3. price, schedule and report format;
4. whether you can reproduce the fixed-fork tests in `docs/EXTERNAL-REVIEW-REQUEST.md`;
5. your remediation re-test policy.

The full request, threat model and test commands are in the attached package. We will not treat internal tests or automated tooling as a substitute for your independent conclusion.

Regards,
`<name>`

## Send checklist

- [ ] Reviewer signed conflict/independence statement
- [ ] Review package hash matches `REVIEW-MANIFEST.json` and `.sha256`
- [ ] SOW covers Critical/High block rule and re-test
- [ ] Reviewer has access to the fixed fork RPC or an equivalent archived snapshot
- [ ] No Falcon private key, backup passphrase or user data included

## Log

| Date | Reviewer | Package hash | Status | Next action |
|---|---|---|---|---|
|  |  |  |  |  |
