import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { UsageError } from "./args.js";
import type { Hex } from "viem";

export interface GuardianArtifact {
  abi: readonly unknown[];
  bytecode: Hex;
}

export function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);
  for (;;) {
    const candidate = resolve(current, "contracts/out/Guardian.sol/Guardian.json");
    if (existsSync(candidate)) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(start);
}

export function loadGuardianArtifact(path?: string): GuardianArtifact {
  const artifactPath = path ?? resolve(findRepoRoot(), "contracts/out/Guardian.sol/Guardian.json");
  if (!existsSync(artifactPath)) {
    throw new UsageError(`Guardian artifact not found at ${artifactPath}; run forge build in contracts/ or pass --artifact`);
  }
  const parsed = JSON.parse(readFileSync(artifactPath, "utf8")) as {
    abi?: readonly unknown[];
    bytecode?: { object?: string } | string;
  };
  const bytecode = typeof parsed.bytecode === "string" ? parsed.bytecode : parsed.bytecode?.object;
  if (!Array.isArray(parsed.abi) || typeof bytecode !== "string" || !bytecode.startsWith("0x")) {
    throw new UsageError("artifact must be a Foundry JSON artifact with abi and bytecode.object");
  }
  return { abi: parsed.abi, bytecode: bytecode as Hex };
}
