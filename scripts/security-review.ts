#!/usr/bin/env bun
/**
 * Q-Tape M2.1 static review guard.
 *
 * This is an internal, deterministic check, not an independent audit. It fails
 * closed on source patterns that would indicate a forbidden bypass in the
 * formal Guardian or in the M2 client/relayer/signer boundaries.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const failures: string[] = [];
const checks: { name: string; ok: boolean; detail?: string }[] = [];

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function check(name: string, fn: () => string[]): void {
  const errors = fn();
  checks.push({ name, ok: errors.length === 0, ...(errors.length ? { detail: errors.join("; ") } : {}) });
  failures.push(...errors.map((error) => `${name}: ${error}`));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

check("Guardian source has no classic bypass primitives", () => {
  const source = stripComments(read("contracts/src/Guardian.sol"));
  const errors: string[] = [];
  for (const pattern of [
    /\bdelegatecall\b/,
    /\bselfdestruct\b/,
    /\bsuicide\b/,
    /\.approve\s*\(/,
    /setApprovalForAll\s*\(/,
    /\bupgradeTo\b/,
    /\btransferOwnership\b/,
    /\btx\.origin\b/,
  ]) {
    if (pattern.test(source)) errors.push(`forbidden pattern ${pattern}`);
  }
  if (/\breceive\s*\(/.test(source) || /\bfallback\s*\(/.test(source)) errors.push("receive/fallback entry point");
  if (/\bfunction\s+owner\s*\(/.test(source)) errors.push("owner() entry point");
  return errors;
});

check("Guardian only exposes narrow entry points", () => {
  const source = read("contracts/src/Guardian.sol");
  const names = [...source.matchAll(/\bfunction\s+([A-Za-z0-9_]+)\s*\(/g)].map((match) => match[1]);
  const allowed = new Set([
    "execute",
    "keyFingerprint",
    "onERC721Received",
    "_executeBatch",
    "_validateRegistryCall",
    "_validateBindingCall",
    "_exit",
    "_rotateKey",
    "_keyProofDigest",
    "_validatePublicKey",
    "_requireExact",
  ]);
  return [...new Set(names)].filter((name) => !allowed.has(name)).map((name) => `unexpected function ${name}`);
});

check("formal domain is not the laboratory domain", () => {
  const protocol = read("packages/protocol/src/request.ts");
  const guardian = read("contracts/src/Guardian.sol");
  const errors: string[] = [];
  if (!protocol.includes('"Q-Tape Guardian v1"')) errors.push("protocol formal domain missing");
  if (!guardian.includes('"Q-Tape Guardian v1"')) errors.push("contract formal domain missing");
  if (guardian.includes('"Q-Tape lab Guardian v1"')) errors.push("contract contains laboratory domain");
  return errors;
});

check("private key boundaries", () => {
  const errors: string[] = [];
  for (const packageDir of ["apps/relayer/package.json", "apps/web/package.json", "packages/client/package.json"]) {
    if (read(packageDir).includes('"@qtape/signer"')) errors.push(`${packageDir} depends on signer`);
  }
  const relayerSource = read("apps/relayer/src/chain.ts");
  if (/Q_TAPE_.*PRIVATE_KEY/.test(relayerSource)) errors.push("relayer source mentions private key env directly");
  const webSource = read("apps/web/src/client.ts");
  if (/secretKey|backup passphrase|falcon private/i.test(webSource)) errors.push("web client mentions secret key material");
  return errors;
});

check("M1 credentials are not tracked", () => {
  const errors: string[] = [];
  const ignore = read(".gitignore");
  for (const pattern of ["*.age", "*.key", "**/fixtures/*.bin", "**/results/"]) {
    if (!ignore.includes(pattern)) errors.push(`.gitignore missing ${pattern}`);
  }
  return errors;
});

check("documented external-review status is explicit", () => {
  const text = read("docs/SECURITY-REVIEW-M2.md");
  if (!/external|外部/i.test(text)) return ["SECURITY-REVIEW-M2.md does not mention external review"];
  if (!/not.*(complete|reviewed)|未.*(完成|审查)|pending/i.test(text)) return ["SECURITY-REVIEW-M2.md does not state pending external review"];
  return [];
});

for (const result of checks) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail ? `: ${result.detail}` : ""}`);
}
if (failures.length > 0) {
  console.error(`security-review: ${failures.length} violation(s)`);
  process.exit(1);
}
console.log("security-review: OK");
