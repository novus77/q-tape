import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { collectViteDist } from "../src/index.js";

const fixture = resolve(import.meta.dir, "fixtures/site");
const roots: string[] = [];

describe("Vite dist adapter", () => {
  test("collects nested files with stable relative paths", () => {
    const files = collectViteDist(fixture);
    expect(files.map((file) => file.path)).toEqual(["assets/app.js", "assets/empty.txt", "index.html"]);
    expect(new TextDecoder().decode(files[2]!.content)).toContain("vite fixture");
  });

  test("rejects symlinks instead of following them", () => {
    const root = mkdtempSync(resolve(import.meta.dir, ".vite-"));
    roots.push(root);
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "index.html"), "ok");
    symlinkSync("/etc/passwd", join(root, "leak.txt"));
    expect(() => collectViteDist(root)).toThrow("symlink");
  });
});

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
