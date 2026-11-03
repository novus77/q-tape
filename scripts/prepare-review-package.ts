#!/usr/bin/env bun
/**
 * Prepare a deterministic external-review source package from tracked files.
 *
 * It refuses to run on a dirty worktree, uses `git ls-files` (so ignored
 * vendor/keys/results cannot leak), writes a SHA-256 manifest, tars the files
 * and records the archive hash. It does not claim the review itself.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
function arg(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
}
const outPath = resolve(root, arg("out", "review-artifacts/qtape-m3-review.tar.gz")!);
const force = args.includes("--force");

const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root, stdout: "pipe" }).stdout.toString().trim();
if (status.length > 0 && !force) throw new Error("review package requires a clean worktree; pass --force only for a local dry run");
const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout.toString().trim();
const branch = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, stdout: "pipe" }).stdout.toString().trim();
const tracked = Bun.spawnSync(["git", "ls-files"], { cwd: root, stdout: "pipe" }).stdout.toString().split("\n").filter(Boolean);
const prefixes = [
  "AGENTS.md", "README.md", "SECURITY.md", "LICENSE", "package.json", "bun.lock", "tsconfig.base.json",
  "contracts/src/", "contracts/test/", "contracts/foundry.toml", "contracts/scripts/", "contracts/tools/", "contracts/README.md",
  "packages/", "apps/", "docs/", "scripts/", "examples/",
  "experiments/guardian-fork/README.md", "experiments/guardian-fork/src/", "experiments/guardian-fork/test/", "experiments/guardian-fork/foundry.toml",
];
const files = tracked.filter((path) => prefixes.some((prefix) => path === prefix || (prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix)));
const forbidden = files.filter((path) => /(^|\/)(vendor|node_modules|out|cache|bin|results)\//.test(path) || /\.(age|key|pem|bin)$/.test(path));
if (forbidden.length > 0) throw new Error(`refusing to package forbidden files: ${forbidden.join(", ")}`);

const manifestFiles: { path: string; size: number; sha256: string }[] = [];
for (const path of files) {
  const bytes = new Uint8Array(await Bun.file(resolve(root, path)).arrayBuffer());
  manifestFiles.push({ path, size: bytes.length, sha256: Bun.CryptoHasher.hash("sha256", bytes, "hex") });
}
const manifest = {
  schema: "qtape.review-package.v1",
  generatedAt: new Date().toISOString(),
  git: { branch, commit, worktreeClean: status.length === 0 },
  scope: {
    inScope: ["contracts/src/Guardian.sol", "contracts/src/interfaces/IProtocol.sol", "packages/schema/src", "packages/protocol/src", "packages/signer/src", "packages/signer/native", "packages/client/src", "apps/relayer/src", "apps/web/src"],
    outOfScope: ["external TapeOut proxy upgrades", "mainnet deployment", "real asset custody", "PQClean/fndsa third-party cryptographic audit (dependency review still requested)"],
  },
  reproduction: ["bun install --frozen-lockfile", "bun run bootstrap", "bun run check", "bun run test:fork", "bun run test:m2", "bun run test:m3"],
  exclusions: ["vendor/", "node_modules/", "out/", "cache/", "bin/", "fixtures/", "results/", "review-artifacts/"],
  files: manifestFiles,
};
mkdirSync(resolve(outPath, ".."), { recursive: true });
const manifestPath = resolve(outPath, "..", "REVIEW-MANIFEST.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
const listPath = resolve(outPath, "..", ".review-file-list");
writeFileSync(listPath, `${relative(root, manifestPath)}\n${files.join("\n")}\n`);
const tar = Bun.spawnSync(["tar", "-czf", outPath, "-C", root, "-T", listPath], { cwd: root, stderr: "pipe" });
if (tar.exitCode !== 0) throw new Error(`tar failed: ${tar.stderr.toString()}`);
const archiveHash = new Bun.CryptoHasher("sha256").update(new Uint8Array(await Bun.file(outPath).arrayBuffer())).digest("hex");
writeFileSync(`${outPath}.sha256`, `${archiveHash}  ${outPath.split("/").pop()}\n`);
console.log(JSON.stringify({ ok: true, commit, files: files.length, archive: relative(root, outPath), sha256: archiveHash, manifest: relative(root, manifestPath) }, null, 2));
