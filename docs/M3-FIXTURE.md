# M3.3 Local Self-Hosted Fixture Drill

This is a **self-hosted fixture** drill, not official TapeOut/TapeSend protocol compatibility. It exercises the formal Guardian against a minimal local ERC-721/Container/SiteRegistry/DomainBinding fixture so the full flow can be rehearsed without a public chain.

## Start local chain

```bash
anvil --chain-id 196 --host 127.0.0.1 --port 18548 --silent
```

The fixture script starts a read-only proxy on port 18549 and deploys all fixture contracts from the first Anvil account. It expects a fresh account (nonce 0).

## Run

```bash
bun run m3:fixture
```

The drill covers:

- fixture deployment and profile registration (`fixture-local`)
- formal Guardian deployment at the predicted address with a real Falcon KeyProof
- `inspectSite` before/after NFT deposit (`UNPROTECTED` → `PROTECTED`)
- ReleasePlan containing nested, empty and multi-chunk files → sign → submit → same-block two-endpoint readback `VERIFIED`
- replay simulation rejected after a successful request
- nonzero renewal (`monthlyFee = 1 ether`) with exact amount forwarding
- key rotation and exit to a fixed recipient

All transactions are local Anvil only. Fixture contracts are intentionally simplified and must not be used as evidence of official protocol compatibility or production safety.
