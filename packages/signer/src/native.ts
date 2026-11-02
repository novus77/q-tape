import {
  FALCON512_PUBLIC_KEY_BYTES,
  FALCON512_SECRET_KEY_BYTES,
  FALCON512_SIGNATURE_MAX_BYTES,
} from "@qtape/schema";
import { fileURLToPath } from "node:url";
import { signerError } from "./errors.js";

const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

export interface NativeKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

type NativeMode = "keygen" | "sign" | "verify";

/**
 * Resolve the native signer executable. An explicit option wins; the
 * Q_TAPE_SIGNER_BIN environment variable exists for test and CI harnesses
 * only and must never point at an untrusted binary.
 */
export function resolveBinaryPath(binaryPath?: string): string {
  if (binaryPath !== undefined && binaryPath.length > 0) return binaryPath;
  const overridden = process.env.Q_TAPE_SIGNER_BIN;
  if (overridden !== undefined && overridden.length > 0) return overridden;
  return fileURLToPath(new URL("../bin/qtape-falcon", import.meta.url));
}

export async function keygen(binaryPath?: string): Promise<NativeKeypair> {
  const result = await runNative("keygen", new Uint8Array(), binaryPath);
  if (result.exitCode !== 0) nativeFailure("keygen", result.exitCode);
  return parseKeygenOutput(result.stdout);
}

export async function signWithSecretKey(
  secretKey: Uint8Array,
  digest: Uint8Array,
  binaryPath?: string,
): Promise<Uint8Array> {
  if (secretKey.length !== FALCON512_SECRET_KEY_BYTES) {
    signerError("SIGNER_FAILED", `secret key must be ${FALCON512_SECRET_KEY_BYTES} bytes`);
  }
  if (digest.length !== 32) signerError("SIGNER_FAILED", "digest must be exactly 32 bytes");

  const result = await runNative("sign", concatBytes(encodeU32(secretKey.length), secretKey, digest), binaryPath);
  if (result.exitCode !== 0) nativeFailure("sign", result.exitCode);
  return parseSignatureOutput(result.stdout);
}

export async function verifyWithPublicKey(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
  binaryPath?: string,
): Promise<boolean> {
  if (publicKey.length !== FALCON512_PUBLIC_KEY_BYTES || publicKey[0] !== 0x09) {
    signerError("SIGNER_FAILED", `public key must be ${FALCON512_PUBLIC_KEY_BYTES} bytes beginning with 0x09`);
  }
  if (message.length > MAX_MESSAGE_BYTES) signerError("SIGNER_FAILED", "message exceeds the native signer limit");
  if (signature.length === 0 || signature.length > FALCON512_SIGNATURE_MAX_BYTES) {
    signerError("SIGNER_FAILED", `signature must be between 1 and ${FALCON512_SIGNATURE_MAX_BYTES} bytes`);
  }

  const input = concatBytes(
    encodeU32(publicKey.length),
    publicKey,
    encodeU32(message.length),
    message,
    encodeU32(signature.length),
    signature,
  );
  const result = await runNative("verify", input, binaryPath);
  if (result.exitCode !== 0 && result.exitCode !== 2) nativeFailure("verify", result.exitCode);
  if (result.stdout.length !== 1) {
    signerError("SIGNER_FAILED", `native signer verify returned ${result.stdout.length} output bytes`);
  }
  if (result.stdout[0] === 0x01) return true;
  if (result.stdout[0] === 0x00) return false;
  signerError("SIGNER_FAILED", "native signer verify returned an invalid status byte");
}

async function runNative(
  mode: NativeMode,
  input: Uint8Array,
  binaryPath?: string,
): Promise<{ stdout: Uint8Array; exitCode: number }> {
  const executable = resolveBinaryPath(binaryPath);
  if (!(await Bun.file(executable).exists())) {
    signerError(
      "SIGNER_UNAVAILABLE",
      `native signer not found at ${executable}; run bash packages/signer/scripts/bootstrap.sh`,
    );
  }

  const child = spawnNative(executable, mode);
  const stdout = new Response(child.stdout).arrayBuffer();
  const stderr = new Response(child.stderr).text();
  try {
    child.stdin.write(input);
    await child.stdin.end();
  } catch {
    // A strict native implementation may close stdin on a framing error;
    // the exit code and stdout are still authoritative.
  }

  const [stdoutBuffer, exitCode] = await Promise.all([stdout, child.exited]);
  await stderr;
  return { stdout: new Uint8Array(stdoutBuffer), exitCode };
}

function spawnNative(executable: string, mode: NativeMode) {
  try {
    return Bun.spawn({ cmd: [executable, mode], stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  } catch {
    signerError("SIGNER_UNAVAILABLE", `cannot execute native signer at ${executable}`);
  }
}

function parseKeygenOutput(bytes: Uint8Array): NativeKeypair {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const publicKeyLength = readU32(view, 0);
  if (publicKeyLength !== FALCON512_PUBLIC_KEY_BYTES) {
    signerError("SIGNER_FAILED", `native signer keygen returned public key length ${publicKeyLength}`);
  }
  const publicKeyEnd = 4 + publicKeyLength;
  if (publicKeyEnd + 4 > bytes.length) signerError("SIGNER_FAILED", "native signer keygen returned a truncated frame");
  const secretKeyLength = readU32(view, publicKeyEnd);
  if (secretKeyLength !== FALCON512_SECRET_KEY_BYTES) {
    signerError("SIGNER_FAILED", `native signer keygen returned secret key length ${secretKeyLength}`);
  }
  const secretKeyStart = publicKeyEnd + 4;
  if (secretKeyStart + secretKeyLength !== bytes.length) {
    signerError("SIGNER_FAILED", "native signer keygen returned an invalid frame length");
  }
  return {
    publicKey: bytes.slice(4, publicKeyEnd),
    secretKey: bytes.slice(secretKeyStart, secretKeyStart + secretKeyLength),
  };
}

function parseSignatureOutput(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signatureLength = readU32(view, 0);
  if (signatureLength === 0 || signatureLength > FALCON512_SIGNATURE_MAX_BYTES) {
    signerError("SIGNER_FAILED", `native signer returned signature length ${signatureLength}`);
  }
  if (4 + signatureLength !== bytes.length) {
    signerError("SIGNER_FAILED", "native signer returned an invalid signature frame");
  }
  return bytes.slice(4);
}

function readU32(view: DataView, offset: number): number {
  if (offset + 4 > view.byteLength) signerError("SIGNER_FAILED", "native signer returned a truncated frame");
  return view.getUint32(offset, false);
}

function encodeU32(value: number): Uint8Array {
  const encoded = new Uint8Array(4);
  new DataView(encoded.buffer).setUint32(0, value, false);
  return encoded;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

function nativeFailure(mode: NativeMode, exitCode: number): never {
  signerError("SIGNER_FAILED", `native signer ${mode} failed with exit code ${exitCode}`);
}
