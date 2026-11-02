import {
  bytesToHex,
  createKeyBundleV1,
  parseBytes32,
  parseKeyBundleV1,
  SchemaError,
  type Hex,
  type KeyBundleV1,
} from "@qtape/schema";
import { encodeBackupCheck, publicKeyFingerprint } from "@qtape/protocol";
import { Decrypter, Encrypter } from "age-encryption";
import { chmod } from "node:fs/promises";
import { keygen } from "./native.js";
import { signerError } from "./errors.js";
import { signDigest, verifySignature } from "./sign.js";

const AGE_V1_MAGIC = "age-encryption.org/v1";

export interface CreateKeyBundleOptions {
  binaryPath?: string;
  createdAt?: string;
  /** Test-only speed knob. Production backups must use the age default (18). */
  scryptWorkFactor?: number;
}

export interface CreatedKeyBundle {
  bundle: KeyBundleV1;
  fileBytes: Uint8Array;
  publicKeyFingerprint: Hex;
}

export interface VerifyBackupInput {
  path: string;
  passphrase: string;
  challenge?: Hex;
  binaryPath?: string;
}

export interface BackupVerification {
  publicKey: Hex;
  fingerprint: Hex;
  challenge: Hex;
  digest: Hex;
  verified: true;
}

export async function createKeyBundle(
  passphrase: string,
  options?: CreateKeyBundleOptions,
): Promise<CreatedKeyBundle> {
  const keypair = await keygen(options?.binaryPath);
  try {
    const bundle = createKeyBundleV1({
      publicKey: keypair.publicKey,
      secretKey: keypair.secretKey,
      ...(options?.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    });
    const fileBytes = await encryptBundle(bundle, passphrase, options?.scryptWorkFactor);
    return {
      bundle,
      fileBytes,
      publicKeyFingerprint: publicKeyFingerprint(bundle.publicKey),
    };
  } finally {
    keypair.secretKey.fill(0);
  }
}

export async function writeKeyBundle(path: string, bundle: KeyBundleV1, passphrase: string): Promise<void> {
  const parsed = parseKeyBundleV1(bundle);
  const fileBytes = await encryptBundle(parsed, passphrase);
  await Bun.write(path, fileBytes);
  await chmod(path, 0o600);
}

export async function readKeyBundle(path: string, passphrase: string): Promise<KeyBundleV1> {
  const fileBytes = await readBundleFile(path);
  return decryptKeyBundle(fileBytes, passphrase);
}

export async function verifyBackup(input: VerifyBackupInput): Promise<BackupVerification> {
  const bundle = await readKeyBundle(input.path, input.passphrase);
  const challenge = input.challenge ?? randomChallenge();
  let parsedChallenge: Hex;
  try {
    parsedChallenge = parseBytes32(challenge, "challenge");
  } catch {
    signerError("VERIFICATION_FAILED", "challenge must be a 32-byte hex value");
  }

  const { digest } = encodeBackupCheck({ publicKey: bundle.publicKey, challenge: parsedChallenge });
  const signature = await signDigest({
    digest,
    bundle,
    ...(input.binaryPath === undefined ? {} : { binaryPath: input.binaryPath }),
  });
  const verified = await verifySignature({
    publicKey: bundle.publicKey,
    message: digest,
    signature,
    ...(input.binaryPath === undefined ? {} : { binaryPath: input.binaryPath }),
  });
  if (!verified) {
    signerError("BACKUP_VERIFICATION_FAILED", "backup check signature did not verify with the bundle public key");
  }

  return {
    publicKey: bundle.publicKey,
    fingerprint: publicKeyFingerprint(bundle.publicKey),
    challenge: parsedChallenge,
    digest,
    verified: true,
  };
}

async function readBundleFile(path: string): Promise<Uint8Array> {
  try {
    return await Bun.file(path).bytes();
  } catch {
    signerError("CORRUPT_BUNDLE", `cannot read key bundle at ${path}`);
  }
}

async function decryptKeyBundle(fileBytes: Uint8Array, passphrase: string): Promise<KeyBundleV1> {
  if (
    fileBytes.length < AGE_V1_MAGIC.length ||
    new TextDecoder().decode(fileBytes.slice(0, AGE_V1_MAGIC.length)) !== AGE_V1_MAGIC
  ) {
    signerError("CORRUPT_BUNDLE", "key bundle is not an age v1 file");
  }

  let plaintext: Uint8Array;
  try {
    const decrypter = new Decrypter();
    decrypter.addPassphrase(requirePassphrase(passphrase));
    plaintext = await decrypter.decrypt(fileBytes);
  } catch (error) {
    if (error instanceof Error && error.message.includes("no identity matched")) {
      signerError("INVALID_PASSPHRASE", "key bundle passphrase is incorrect");
    }
    signerError("CORRUPT_BUNDLE", "key bundle authentication failed");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
  } catch {
    signerError("CORRUPT_BUNDLE", "key bundle payload is not valid UTF-8 JSON");
  }

  try {
    return parseKeyBundleV1(parsed);
  } catch (error) {
    if (error instanceof SchemaError) signerError("INVALID_KEY_BUNDLE", error.message);
    throw error;
  }
}

async function encryptBundle(
  bundle: KeyBundleV1,
  passphrase: string,
  scryptWorkFactor?: number,
): Promise<Uint8Array> {
  const encrypter = new Encrypter();
  encrypter.setPassphrase(requirePassphrase(passphrase));
  if (scryptWorkFactor !== undefined) encrypter.setScryptWorkFactor(scryptWorkFactor);
  return encrypter.encrypt(JSON.stringify(bundle));
}

function requirePassphrase(passphrase: string): string {
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    signerError("INVALID_PASSPHRASE", "passphrase must be a non-empty string");
  }
  return passphrase;
}

function randomChallenge(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
