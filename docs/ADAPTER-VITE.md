# Vite publishing adapter (M2.3)

`@qtape/adapter-vite` is a real static-build-tool adapter for Vite `dist/` output. It is **not** an integration with TapeCI, HashPort or any third-party publishing platform.

## Flow

```bash
# 1. Build fixed artifact with the real Vite CLI
vite build

# 2. Plan from the immutable dist directory
bun -e 'import { planViteRelease } from "@qtape/adapter-vite"; ...'

# 3. User reviews the plan and signs with the local Q-Tape signer
qtape request sign plan.json --key ~/.qtape/old.age --out signed.json

# 4. Submit unchanged through wallet or relayer, then verify
qtape request submit signed.json --relayer http://127.0.0.1:8787
qtape release verify plan.json --block <block> --rpc <operator-a> --rpc <operator-b>
```

The adapter:

- treats `dist/` as immutable input; it does not rebuild or rewrite files;
- rejects symlinks and paths escaping the dist root;
- computes SHA-256 from actual bytes through `@qtape/client` `planRelease`;
- never receives a Falcon private key or signs anything;
- does not depend on CLI internals or a server.

## Test

```bash
cd packages/adapter-vite && bun test
```

The fixture covers nested assets, empty files and symlink rejection. The adapter should be tested against the actual `vite build` output for each design partner; the fixture is not a claim that every Vite configuration is supported.

## Boundary

The adapter only standardizes the “build output → ReleasePlan” edge. It does not claim compatibility with a vendor hosting platform, does not provide a bypass mode and does not move signing into CI.
