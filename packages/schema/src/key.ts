import { bytesToHex, encodeBase64, hexToBytes, parseBase64, parseHexData, requireObject, type Hex } from "./bytes.js";
import { schemaError } from "./errors.js";

export const KEY_BUNDLE_SCHEMA = "qtape.keybundle.v1" as const;
export const KEY_ALGORITHM = "falcon-512-pqclean-round3-v1.2" as const;
export const FALCON512_PUBLIC_KEY_BYTES = 897;
export const FALCON512_SECRET_KEY_BYTES = 1281;
export const FALCON512_SIGNATURE_MAX_BYTES = 752;

export interface KeyBundleV1 {
  schema: typeof KEY_BUNDLE_SCHEMA;
  algorithm: typeof KEY_ALGORITHM;
  publicKey: Hex;
  secretKey: string;
  createdAt: string;
}

const KEY_BUNDLE_FIELDS = ["schema", "algorithm", "publicKey", "secretKey", "createdAt"] as const;

export function validateFalconPublicKeyBytes(value: Uint8Array): void {
  if (value.length !== FALCON512_PUBLIC_KEY_BYTES) {
    schemaError("INVALID_PUBLIC_KEY", `Falcon-512 public key must be ${FALCON512_PUBLIC_KEY_BYTES} bytes`);
  }
  if (value[0] !== 0x09) schemaError("INVALID_PUBLIC_KEY", "Falcon-512 public key header must be 0x09");
}

export function validateFalconSecretKeyBytes(value: Uint8Array): void {
  if (value.length !== FALCON512_SECRET_KEY_BYTES) {
    schemaError("INVALID_SECRET_KEY", `Falcon-512 secret key must be ${FALCON512_SECRET_KEY_BYTES} bytes`);
  }
}

export function parsePublicKey(value: unknown): Hex {
  const hex = parseHexData(value, "publicKey");
  validateFalconPublicKeyBytes(hexToBytes(hex, "publicKey"));
  return hex;
}

export function parseKeyBundleV1(value: unknown): KeyBundleV1 {
  const record = requireObject(value, KEY_BUNDLE_FIELDS, "keyBundle");
  if (record.schema !== KEY_BUNDLE_SCHEMA) schemaError("INVALID_SCHEMA", `schema must be ${KEY_BUNDLE_SCHEMA}`);
  if (record.algorithm !== KEY_ALGORITHM) schemaError("INVALID_ALGORITHM", `algorithm must be ${KEY_ALGORITHM}`);
  const publicKey = parsePublicKey(record.publicKey);
  const secretKey = parseBase64(record.secretKey, "secretKey");
  validateFalconSecretKeyBytes(secretKey);
  if (typeof record.createdAt !== "string") schemaError("INVALID_TYPE", "createdAt must be a string");
  const createdAt = new Date(record.createdAt);
  if (Number.isNaN(createdAt.getTime())) schemaError("INVALID_CREATED_AT", "createdAt must be ISO 8601");
  return {
    schema: KEY_BUNDLE_SCHEMA,
    algorithm: KEY_ALGORITHM,
    publicKey,
    secretKey: record.secretKey as string,
    createdAt: createdAt.toISOString(),
  };
}

export function createKeyBundleV1(input: {
  publicKey: Hex | Uint8Array;
  secretKey: Uint8Array;
  createdAt?: string;
}): KeyBundleV1 {
  const publicKey = typeof input.publicKey === "string" ? parsePublicKey(input.publicKey) : bytesToHex(input.publicKey);
  validateFalconSecretKeyBytes(input.secretKey);
  return parseKeyBundleV1({
    schema: KEY_BUNDLE_SCHEMA,
    algorithm: KEY_ALGORITHM,
    publicKey,
    secretKey: encodeBase64(input.secretKey),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}
