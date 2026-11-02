# Publisher adapter example

This directory is a minimal example of a publishing tool using the public Q-Tape client SDK and local signer. It is **not** an integration with TapeCI, HashPort or any third-party platform.

Flow:

1. The tool builds fixed artifact files.
2. `buildReleasePlan` calls `planRelease` with two independent RPC endpoints.
3. `signPlanBatch` asks the local signer to sign the exact batch; the signer decrypts the age bundle only in the local process.
4. The tool submits the returned `SignedRequestV1` unchanged to a relayer or wallet, then calls `verifyRelease` from `@qtape/client`.

The adapter has no API for bypassing verification, no Falcon key input in the browser/CI, and no second transaction encoder. See [docs/INTEGRATION.md](../../docs/INTEGRATION.md).
