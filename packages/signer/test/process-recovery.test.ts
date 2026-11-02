import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createKeyBundle } from "../src/bundle.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("backup recovery in an independent process", () => {
  test("recovers the same public key and verifies a fresh challenge outside the original process", async () => {
    const dir = mkdtempSync(resolve(import.meta.dir, ".recovery-"));
    roots.push(dir);
    const bundlePath = join(dir, "guardian.age");
    const passphrase = "independent recovery passphrase";
    const created = await createKeyBundle(passphrase, { scryptWorkFactor: 4 });
    await Bun.write(bundlePath, created.fileBytes);

    const script = `
      const passphrase = (await Bun.stdin.text()).trim();
      const { verifyBackup } = await import("./src/index.ts");
      const result = await verifyBackup({ path: process.env.Q_TAPE_TEST_KEY_PATH, passphrase });
      console.log(JSON.stringify(result));
    `;
    const child = Bun.spawn(["bun", "-e", script], {
      cwd: resolve(import.meta.dir, ".."),
      env: { ...process.env, Q_TAPE_TEST_KEY_PATH: bundlePath },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    child.stdin.write(passphrase + "\n");
    child.stdin.end();
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(stderr).not.toContain(passphrase);
    const result = JSON.parse(stdout) as { publicKey: string; fingerprint: string; verified: boolean };
    expect(result.publicKey).toBe(created.bundle.publicKey);
    expect(result.fingerprint).toBe(created.publicKeyFingerprint);
    expect(result.verified).toBe(true);
  });
});
