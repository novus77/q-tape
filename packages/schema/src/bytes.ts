import { schemaError } from "./errors.js";

export type Hex = `0x${string}`;

const UINT256_MAX = (1n << 256n) - 1n;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const UINT_DECIMAL_PATTERN = /^(0|[1-9][0-9]*)$/;
const HEX_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function parseUint256(value: unknown, field = "value"): string {
  if (typeof value !== "string") schemaError("INVALID_UINT256", `${field} must be a decimal string`);
  if (!UINT_DECIMAL_PATTERN.test(value)) {
    schemaError("INVALID_UINT256", `${field} must be a canonical decimal uint256 string`);
  }
  if (BigInt(value) > UINT256_MAX) schemaError("INVALID_UINT256", `${field} exceeds uint256`);
  return value;
}

export function parseAddress(value: unknown, field = "address"): Hex {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) {
    schemaError("INVALID_ADDRESS", `${field} must be a 20-byte 0x hex address`);
  }
  return value.toLowerCase() as Hex;
}

export function parseHexData(value: unknown, field = "data"): Hex {
  if (typeof value !== "string" || !HEX_PATTERN.test(value)) {
    schemaError("INVALID_HEX", `${field} must be even-length 0x hex`);
  }
  return value.toLowerCase() as Hex;
}

export function parseBytes32(value: unknown, field = "bytes32"): Hex {
  if (typeof value !== "string" || !BYTES32_PATTERN.test(value)) {
    schemaError("INVALID_HEX", `${field} must be 32-byte 0x hex`);
  }
  return value.toLowerCase() as Hex;
}

export function hexToBytes(hex: Hex, field = "hex"): Uint8Array {
  if (!HEX_PATTERN.test(hex)) schemaError("INVALID_HEX", `${field} must be even-length 0x hex`);
  const bytes = new Uint8Array((hex.length - 2) / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(2 + index * 2, 4 + index * 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let output = "0x";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output as Hex;
}

export function parseBase64(value: unknown, field = "base64"): Uint8Array {
  if (typeof value !== "string" || !BASE64_PATTERN.test(value)) {
    schemaError("INVALID_SECRET_KEY", `${field} must be canonical base64`);
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function requireObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    schemaError("INVALID_TYPE", `${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!fields.includes(key)) schemaError("UNKNOWN_FIELD", `${label} has unknown field ${key}`);
  }
  for (const key of fields) {
    if (!(key in record)) schemaError("MISSING_FIELD", `${label} is missing field ${key}`);
  }
  return record;
}
