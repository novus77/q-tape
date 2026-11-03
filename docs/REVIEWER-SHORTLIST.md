# External Reviewer Selection (M3.2, item 1)

This is a selection aid, not a recommendation or a claim that any firm is currently available. Verify conflicts, current practice, pricing and scheduling directly with each reviewer.

## Required competencies

- Solidity/EVM application security: authorization boundaries, calldata canonicalization, external calls, upgradeable proxies.
- Post-quantum integration: Falcon-512/PQClean byte formats, native signing process and key custody.
- TypeScript/Bun supply chain and browser/relayer key-boundary review.
- Ability to reproduce fixed-fork Foundry tests and independently add adversarial tests.
- Written report with severity, evidence, affected code and remediation re-test.

## Candidate categories

| Category | Examples to evaluate | Fit notes |
|---|---|---|
| General smart-contract security firms | Trail of Bits, OpenZeppelin, ConsenSys Diligence, Spearbit, Zellic, Halborn, Quantstamp, Least Authority, NCC Group | Good contract/process coverage; ask specifically for Falcon/PQ and native-process experience |
| PQ/cryptography specialist | PQShield or academic/independent PQ reviewers | Strong Falcon/format expertise; pair with an EVM reviewer if needed |
| Independent senior researchers | Individual Solidity + crypto reviewers | May be cost-effective; require a second reviewer for key handling and dependency review |

No vendor is endorsed by Q-Tape. For this scope, a combined team (EVM + PQ/native) is likely better than a generalist alone.

## Evaluation matrix

Score 1–5 per criterion:

| Criterion | Weight |
|---|---|
| Guardian/EVM review experience | 25% |
| Falcon/PQ or native-key review experience | 20% |
| TypeScript/supply-chain review experience | 15% |
| Fixed-fork reproduction capability | 10% |
| Report quality and remediation re-test commitment | 15% |
| Independence/conflict-of-interest statement | 10% |
| Schedule and price fit | 5% |

Reject any reviewer who:
- is the implementer or has a conflict;
- cannot bind a report to a commit/archive hash;
- cannot commit to a remediation re-test;
- proposes only automated tooling as the review.

## Decision record

- Selected reviewer:
- Firm/individual:
- Lead reviewer:
- Conflict statement received: yes/no
- SOW signed: yes/no
- Start date / target report date:
- Price and payment terms:
- Report publication/confidentiality terms:
- Package commit + archive SHA-256:
