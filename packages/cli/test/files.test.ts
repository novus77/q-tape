import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { collectSiteFiles } from "../src/files.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(resolve(import.meta.dir, ".collect-"));
  roots.push(root);
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "<h1>ok</h1>");
  writeFileSync(join(root, "assets", "app.js"), "console.log(1)");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("artifact file collector", () => {
  test("collects regular files with relative POSIX paths", () => {
    const files = collectSiteFiles(makeRoot());
    expect(files.map((file) => file.path)).toEqual(["assets/app.js", "index.html"]);
  });

  test("rejects symlinks instead of following them", () => {
    const root = makeRoot();
    symlinkSync("/etc/passwd", join(root, "leak.txt"));
    expect(() => collectSiteFiles(root)).toThrow("symlink is not allowed");
  });
});
