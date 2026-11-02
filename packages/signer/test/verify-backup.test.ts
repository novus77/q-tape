import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { bytesToHex, type Hex } from "@qtape/schema";
import { encodeBackupCheck, publicKeyFingerprint } from "@qtape/protocol";
import { join } from "node:path";
import {
  createBackupCheckSignature,
  createKeyBundle,
  keygen,
  verifyBackup,
  verifySignature,
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

const CHALLENGE = ("0x" + "cd".repeat(32)) as Hex;

let tempDir: string;
let bundlePath: string;
let created: CreatedKeyBundle;

beforeAll(async () => {
  tempDir = await createTempDir();
  bundlePath = join(tempDir, "backup.age");
  created = await createKeyBundle(TEST_PASSPHRASE, TEST_BUNDLE_OPTIONS);
  await writeKeyBundle(bundlePath, created.bundle, TEST_PASSPHRASE);
});

afterAll(async () => {
  await removeTempDir(tempDir);
});

describe("backup drill", () => {
  test("verifyBackup returns a native-verified backup check with the requested challenge", async () => {
    const result = await verifyBackup({ path: bundlePath, passphrase: TEST_PASSPHRASE, challenge: CHALLENGE });
    const expected = encodeBackupCheck({ publicKey: created.bundle.publicKey, challenge: CHALLENGE });

    expect(result.verified).toBe(true);
    expect(result.publicKey).toBe(created.bundle.publicKey);
    expect(result.fingerprint).toBe(publicKeyFingerprint(created.bundle.publicKey));
    expect(result.challenge).toBe(CHALLENGE);
    expect(result.digest).toBe(expected.digest);

    // A separately produced real Falcon signature over the same digest is
    // accepted by the native verifier, proving the backup check is a real
    // signature and not a placeholder boolean.
    const signature = await createBackupCheckSignature({ bundle: created.bundle, challenge: CHALLENGE });
    expect(signature.digest).toBe(expected.digest);
    expect(await verifySignature({
      publicKey: created.bundle.publicKey,
      message: result.digest,
      signature: signature.signature,
    })).toBe(true);
  });

  test("verifyBackup generates a fresh 32-byte challenge when one is omitted", async () => {
    const first = await verifyBackup({ path: bundlePath, passphrase: TEST_PASSPHRASE });
    const second = await verifyBackup({ path: bundlePath, passphrase: TEST_PASSPHRASE });
    expect(first.challenge.length).toBe(66);
    expect(first.challenge.startsWith("0x")).toBe(true);
    expect(first.challenge).not.toBe(second.challenge);
    expect(first.digest).not.toBe(second.digest);
  });

  test("verifyBackup rejects the wrong passphrase", async () => {
    await expectSignerError(
      () => verifyBackup({ path: bundlePath, passphrase: "wrong backup passphrase", challenge: CHALLENGE }),
      "INVALID_PASSPHRASE",
    );
  });

  test("verifyBackup rejects a bundle whose public key does not match its secret key", async () => {
    const other = await keygen();
    const mismatchedPath = join(tempDir, "mismatched.age");
    const mismatched = { ...created.bundle, publicKey: bytesToHex(other.publicKey) };
    await Bun.write(mismatchedPath, await encryptRawBundle(mismatched, TEST_PASSPHRASE));
    other.secretKey.fill(0);

    await expectSignerError(
      () => verifyBackup({ path: mismatchedPath, passphrase: TEST_PASSPHRASE, challenge: CHALLENGE }),
      "BACKUP_VERIFICATION_FAILED",
    );
  });
});
