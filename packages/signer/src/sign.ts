import {
  bytesToHex,
  hexToBytes,
  parseBase64,
  parseBytes32,
  parseHexData,
  parseKeyBundleV1,
  parsePublicKey,
  type Hex,
  type KeyBundleV1,
} from "@qtape/schema";
import { encodeBackupCheck, encodeKeyProof, publicKeyFingerprint } from "@qtape/protocol";
import { signWithSecretKey, verifyWithPublicKey } from "./native.js";
import { signerError } from "./errors.js";

export interface SignDigestInput {
  digest: Hex;
  bundle: KeyBundleV1;
  binaryPath?: string;
}

export interface CreateKeyProofInput {
  bundle: KeyBundleV1;
  chainId: string | bigint;
  vault: string;
  challenge: Hex;
  binaryPath?: string;
}

export interface CreateBackupCheckSignatureInput {
  bundle: KeyBundleV1;
  challenge: Hex;
  binaryPath?: string;
}

export interface KeyProofSignature {
  publicKey: Hex;
  fingerprint: Hex;
  message: Hex;
  digest: Hex;
  signature: Hex;
}

export interface BackupCheckSignature {
  publicKey: Hex;
  fingerprint: Hex;
  message: Hex;
  digest: Hex;
  signature: Hex;
}

export interface VerifySignatureInput {
  publicKey: Hex;
  message: Hex;
  signature: Hex;
  binaryPath?: string;
}

/**
 * Sign the 32 raw digest bytes with Falcon-512. The digest is never
 * re-hashed or wrapped in an EIP-191 prefix.
 */
export async function signDigest(input: SignDigestInput): Promise<Hex> {
  const bundle = parseKeyBundleV1(input.bundle);
  const secretKey = parseBase64(bundle.secretKey, "secretKey");
  try {
    const signature = await signWithSecretKey(
      secretKey,
      hexToBytes(parseBytes32(input.digest, "digest")),
      input.binaryPath,
    );
    return bytesToHex(signature);
  } finally {
    secretKey.fill(0);
  }
}

export async function createKeyProof(input: CreateKeyProofInput): Promise<KeyProofSignature> {
  const bundle = parseKeyBundleV1(input.bundle);
  const encoded = encodeKeyProof({
    chainId: input.chainId,
    vault: input.vault,
    publicKey: bundle.publicKey,
    challenge: input.challenge,
  });
  const signature = await signDigest({
    digest: encoded.digest,
    bundle,
    ...(input.binaryPath === undefined ? {} : { binaryPath: input.binaryPath }),
  });
  return {
    publicKey: bundle.publicKey,
    fingerprint: publicKeyFingerprint(bundle.publicKey),
    message: encoded.message,
    digest: encoded.digest,
    signature,
  };
}

export async function createBackupCheckSignature(
  input: CreateBackupCheckSignatureInput,
): Promise<BackupCheckSignature> {
  const bundle = parseKeyBundleV1(input.bundle);
  const encoded = encodeBackupCheck({ publicKey: bundle.publicKey, challenge: input.challenge });
  const signature = await signDigest({
    digest: encoded.digest,
    bundle,
    ...(input.binaryPath === undefined ? {} : { binaryPath: input.binaryPath }),
  });
  return {
    publicKey: bundle.publicKey,
    fingerprint: publicKeyFingerprint(bundle.publicKey),
    message: encoded.message,
    digest: encoded.digest,
    signature,
  };
}

/** Verify an arbitrary hex message with the native Falcon-512 verifier. */
export async function verifySignature(input: VerifySignatureInput): Promise<boolean> {
  const publicKey = parsePublicKey(input.publicKey);
  const message = parseHexData(input.message, "message");
  const signature = parseHexData(input.signature, "signature");
  if (signature === "0x") signerError("VERIFICATION_FAILED", "signature must not be empty");
  return verifyWithPublicKey(
    hexToBytes(publicKey),
    hexToBytes(message),
    hexToBytes(signature),
    input.binaryPath,
  );
}
