# Fixed deployment profiles

`xlayer-196.json` pins the TAP-10 addresses and accepted ERC-1967 implementations read from the X Layer deployment table. `packages/client/src/profiles.ts` is the runtime source of the same values; the JSON is a reviewable deployment record.

Profiles are fail-closed: an unknown profile, changed implementation slot, changed processor code hash or changed verifier code hash stops inspection/planning. A profile value is an observation of a fixed deployment, not a guarantee about future proxy upgrades.
