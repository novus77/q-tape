import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { bytesToHex, parseBase64 } from "@qtape/schema";
import { publicKeyFingerprint } from "@qtape/protocol";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
  createKeyBundle,
  keygen,
  readKeyBundle,
  verifyBackup,
  writeKeyBundle,
  type CreatedKeyBundle,
} from "../src/index.js";
import {
  TEST_BUNDLE_OPTIONS,
  TEST_PASSPHRASE,
  createTempDir,
  encryptRawBundle,
  expectSignerError,
  removeTempDir,
} from "./helpers.js";

let tempDir: string;
let created: CreatedKeyBundle;
let bundlePath: string;

beforeAll(async () => {
  tempDir = await createTempDir();
  bundlePath = join(tempDir, "guardian-key.age");
  created = await createKeyBundle(TEST_PASSPHRASE, TEST_BUNDLE_OPTIONS);
});

afterAll(async () => {
  await removeTempDir(tempDir);
});

describe("encrypted key bundle", () => {
  test("is an age v1 passphrase file with no plaintext public key or secret key", () => {
    const text = new TextDecoder().decode(created.fileBytes);
    expect(text.startsWith("age-encryption.org/v1\n")).toBe(true);
    expect(text).not.toContain(created.bundle.publicKey);
    expect(text).not.toContain(created.bundle.publicKey.slice(2));
    expect(text).not.toContain(created.bundle.secretKey);
    expect(created.bundle.schema).toBe("qtape.keybundle.v1");
    expect(created.bundle.algorithm).toBe("falcon-512-pqclean-round3-v1.2");
    expect(created.publicKeyFingerprint).toBe(publicKeyFingerprint(created.bundle.publicKey));
  });

  test("round-trips through writeKeyBundle and readKeyBundle", async () => {
    await writeKeyBundle(bundlePath, created.bundle, TEST_PASSPHRASE);
    const fileInfo = await stat(bundlePath);
    expect(fileInfo.mode & 0o777).toBe(0o600);

    const read = await readKeyBundle(bundlePath, TEST_PASSPHRASE);
    expect(read.publicKey).toBe(created.bundle.publicKey);
    expect(read.algorithm).toBe(created.bundle.algorithm);
    expect(read.createdAt).toBe(created.bundle.createdAt);
    expect(parseBase64(read.secretKey).length).toBe(1281);
  });

  test("rejects the wrong passphrase with INVALID_PASSPHRASE and does not echo it", async () => {
    const wrongPassphrase = "definitely-not-the-right-passphrase";
    await writeKeyBundle(bundlePath, created.bundle, TEST_PASSPHRASE);
    const error = await expectSignerError(
      () => readKeyBundle(bundlePath, wrongPassphrase),
      "INVALID_PASSPHRASE",
    );
    expect(error.message).not.toContain(wrongPassphrase);
  });

  test("rejects truncated, corrupted and non-age files with CORRUPT_BUNDLE", async () => {
    const truncatedPath = join(tempDir, "truncated.age");
    await Bun.write(truncatedPath, created.fileBytes.slice(0, 40));
    await expectSignerError(() => readKeyBundle(truncatedPath, TEST_PASSPHRASE), "CORRUPT_BUNDLE");

    const corruptedPath = join(tempDir, "corrupted.age");
    const corrupted = created.fileBytes.slice();
    const lastIndex = corrupted.length - 1;
    corrupted[lastIndex] = corrupted[lastIndex]! ^ 0xff;
    await Bun.write(corruptedPath, corrupted);
    await expectSignerError(() => readKeyBundle(corruptedPath, TEST_PASSPHRASE), "CORRUPT_BUNDLE");

    const plaintextPath = join(tempDir, "not-age.age");
    await Bun.write(plaintextPath, "this is not an age file");
    await expectSignerError(() => readKeyBundle(plaintextPath, TEST_PASSPHRASE), "CORRUPT_BUNDLE");
  });

  test("rejects a bundle encrypted with the wrong algorithm", async () => {
    const wrongAlgorithmPath = join(tempDir, "wrong-algorithm.age");
    const wrongBundle = { ...created.bundle, algorithm: "falcon-1024-pqclean-round3" };
    await Bun.write(wrongAlgorithmPath, await encryptRawBundle(wrongBundle, TEST_PASSPHRASE));
    await expectSignerError(() => readKeyBundle(wrongAlgorithmPath, TEST_PASSPHRASE), "INVALID_KEY_BUNDLE");
  });

  test("rejects a bundle whose public key does not match its secret key", async () => {
    const other = await keygen();
    const mismatchedPath = join(tempDir, "mismatched-key.age");
    const mismatched = { ...created.bundle, publicKey: bytesToHex(other.publicKey) };
    await Bun.write(mismatchedPath, await encryptRawBundle(mismatched, TEST_PASSPHRASE));
    other.secretKey.fill(0);
    await expectSignerError(
      () => verifyBackup({ path: mismatchedPath, passphrase: TEST_PASSPHRASE }),
      "BACKUP_VERIFICATION_FAILED",
    );
  });
});
