import { expect } from "bun:test";
import { Encrypter } from "age-encryption";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignerError, type SignerErrorCode } from "../src/index.js";

export const TEST_PASSPHRASE = "qtape-signer-test-passphrase-correct-horse-battery";

/** Keep test fixtures fast while still exercising the real age v1 format. */
export const TEST_BUNDLE_OPTIONS = { scryptWorkFactor: 12 } as const;

export async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "qtape-signer-test-"));
}

export async function removeTempDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export async function expectSignerError(
  action: () => Promise<unknown>,
  code: SignerErrorCode,
): Promise<SignerError> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(SignerError);
    const signerError = error as SignerError;
    expect(signerError.code).toBe(code);
    return signerError;
  }
  throw new Error(`expected SignerError ${code}`);
}

/** Encrypt arbitrary JSON with age so tests can build malformed bundles. */
export async function encryptRawBundle(value: unknown, passphrase: string): Promise<Uint8Array> {
  const encrypter = new Encrypter();
  encrypter.setPassphrase(passphrase);
  encrypter.setScryptWorkFactor(12);
  return encrypter.encrypt(JSON.stringify(value));
}
