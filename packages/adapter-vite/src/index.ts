/**
 * Vite static-site adapter for Q-Tape.
 *
 * `vite build` produces a fixed `dist/` directory. This adapter treats that
 * directory as immutable input, computes its files and delegates release
 * planning to the public `@qtape/client` SDK. It does not hold a Falcon key,
 * does not sign, and does not claim integration with TapeCI or HashPort.
 */
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { planRelease, type ReleasePlan } from "@qtape/client";

export interface ViteFile {
  path: string;
  content: Uint8Array;
}

export interface PlanViteReleaseInput {
  distDir: string;
  site: string;
  vault: string;
  rpcUrls: string[];
  baseBlock?: string | bigint;
  prune?: boolean;
}

export function collectViteDist(distDir: string): ViteFile[] {
  const absoluteRoot = resolve(distDir);
  const stats = lstatSync(absoluteRoot, { throwIfNoEntry: false });
  if (!stats || !stats.isDirectory()) throw new Error(`Vite dist directory does not exist: ${distDir}`);
  const realRoot = realpathSync(absoluteRoot);
  const files: ViteFile[] = [];
  walk(absoluteRoot, realRoot, files);
  if (files.length === 0) throw new Error("Vite dist directory contains no files; run vite build first");
  return files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

export async function planViteRelease(input: PlanViteReleaseInput): Promise<ReleasePlan> {
  return await planRelease({
    site: input.site,
    vault: input.vault,
    files: collectViteDist(input.distDir),
    rpcUrls: input.rpcUrls,
    ...(input.baseBlock === undefined ? {} : { baseBlock: input.baseBlock }),
    ...(input.prune === undefined ? {} : { prune: input.prune }),
  });
}

function walk(directory: string, realRoot: string, files: ViteFile[]): void {
  for (const entry of readdirSync(directory)) {
    if (entry === ".DS_Store") continue;
    const absolute = join(directory, entry);
    const stats = lstatSync(absolute);
    if (stats.isSymbolicLink()) throw new Error(`Vite dist contains a symlink, refusing to follow: ${absolute}`);
    if (stats.isDirectory()) {
      walk(absolute, realRoot, files);
      continue;
    }
    if (!stats.isFile()) continue;
    const real = realpathSync(absolute);
    if (real !== realRoot && !real.startsWith(realRoot + sep)) throw new Error(`file escapes Vite dist root: ${absolute}`);
    files.push({ path: relative(realRoot, real).split(sep).join("/"), content: new Uint8Array(readFileSync(real)) });
  }
}
