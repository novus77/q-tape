import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { UsageError } from "./args.js";

export interface LocalArtifactFile {
  path: string;
  content: Uint8Array;
}

export function collectSiteFiles(root: string): LocalArtifactFile[] {
  const absoluteRoot = resolve(root);
  let stats;
  try {
    stats = lstatSync(absoluteRoot);
  } catch {
    throw new UsageError(`artifact directory does not exist: ${root}`);
  }
  if (!stats.isDirectory()) throw new UsageError(`artifact path is not a directory: ${root}`);
  const realRoot = realpathSync(absoluteRoot);
  const files: LocalArtifactFile[] = [];
  walk(absoluteRoot, realRoot, files);
  if (files.length === 0) throw new UsageError("artifact directory contains no regular files");
  return files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

function walk(directory: string, realRoot: string, files: LocalArtifactFile[]): void {
  for (const entry of readdirSync(directory)) {
    if (entry === ".DS_Store") continue;
    const absolute = join(directory, entry);
    const stats = lstatSync(absolute);
    if (stats.isSymbolicLink()) throw new UsageError(`symlink is not allowed in artifact: ${absolute}`);
    if (stats.isDirectory()) {
      walk(absolute, realRoot, files);
      continue;
    }
    if (!stats.isFile()) continue;
    const real = realpathSync(absolute);
    if (real !== realRoot && !real.startsWith(realRoot + sep)) {
      throw new UsageError(`file escapes artifact root: ${absolute}`);
    }
    const relativePath = relative(realRoot, real).split(sep).join("/");
    files.push({ path: relativePath, content: new Uint8Array(readFileSync(real)) });
  }
}
