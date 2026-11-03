# M3 Read-Only Preflight

`scripts/m3-preflight.ts` is a **read-only** check before any pilot rehearsal. It never deploys, signs or broadcasts.

```bash
bun scripts/m3-preflight.ts \
  --profile xlayer-196 \
  --site 10.2.4.tape \
  --vault 0xVault \
  --deployer 0xWallet \
  --rpc https://rpc.xlayer.tech --rpc https://xlayer.drpc.org
```

For a registered/fixture profile:

```bash
bun scripts/m3-preflight.ts \
  --profile-file ./fixture-profile.json \
  --site 10.2.0.tape \
  --vault 0xVault \
  --rpc http://127.0.0.1:18548 --rpc http://127.0.0.1:18548
```

It checks:

- chain ID and same-block hash agreement between the supplied operators;
- fixed `SiteRegistry`/`DomainBinding` implementation slots against the profile;
- optional site resolution and protection status;
- optional Vault code/registry/binding/verifier configuration and whether it still holds the bound NFT;
- optional deployer balance and nonce (reported only).

It exits non-zero on a failed check. It does not replace the external security review gate or authorize a pilot.
