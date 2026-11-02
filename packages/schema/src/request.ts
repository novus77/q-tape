import { parseAddress, parseHexData, parseUint256, requireObject, type Hex } from "./bytes.js";
import { schemaError } from "./errors.js";

export const REQUEST_SCHEMA = "qtape.request.v1" as const;

export const OPERATION = {
  EXECUTE: 0,
  EXIT: 1,
  ROTATE_KEY: 2,
} as const;

export type Operation = (typeof OPERATION)[keyof typeof OPERATION];

export interface CallV1 {
  target: Hex;
  value: string;
  data: Hex;
}

export interface RequestV1 {
  schema: typeof REQUEST_SCHEMA;
  chainId: string;
  guardian: Hex;
  operation: Operation;
  calls: CallV1[];
  nonce: string;
  expiry: string;
}

export interface SignedRequestV1 {
  request: RequestV1;
  signature: Hex;
  digest: Hex;
}

const CALL_FIELDS = ["target", "value", "data"] as const;
const REQUEST_FIELDS = ["schema", "chainId", "guardian", "operation", "calls", "nonce", "expiry"] as const;
const SIGNED_REQUEST_FIELDS = ["request", "signature", "digest"] as const;

export function parseCallV1(value: unknown): CallV1 {
  const record = requireObject(value, CALL_FIELDS, "call");
  return {
    target: parseAddress(record.target, "call.target"),
    value: parseUint256(record.value, "call.value"),
    data: parseHexData(record.data, "call.data"),
  };
}

export function parseOperation(value: unknown): Operation {
  if (value !== OPERATION.EXECUTE && value !== OPERATION.EXIT && value !== OPERATION.ROTATE_KEY) {
    schemaError("INVALID_OPERATION", "operation must be numeric 0, 1 or 2");
  }
  return value;
}

export function parseRequestV1(value: unknown): RequestV1 {
  const record = requireObject(value, REQUEST_FIELDS, "request");
  if (record.schema !== REQUEST_SCHEMA) schemaError("INVALID_SCHEMA", `schema must be ${REQUEST_SCHEMA}`);
  if (!Array.isArray(record.calls)) schemaError("INVALID_TYPE", "calls must be an array");
  if (record.calls.length === 0) schemaError("EMPTY_CALLS", "calls must contain at least one call");
  return {
    schema: REQUEST_SCHEMA,
    chainId: parseUint256(record.chainId, "chainId"),
    guardian: parseAddress(record.guardian, "guardian"),
    operation: parseOperation(record.operation),
    calls: record.calls.map(parseCallV1),
    nonce: parseUint256(record.nonce, "nonce"),
    expiry: parseUint256(record.expiry, "expiry"),
  };
}

export function parseSignedRequestV1(value: unknown): SignedRequestV1 {
  const record = requireObject(value, SIGNED_REQUEST_FIELDS, "signedRequest");
  return {
    request: parseRequestV1(record.request),
    signature: parseHexData(record.signature, "signature"),
    digest: parseHexData(record.digest, "digest"),
  };
}

export function createRequestV1(input: {
  chainId: string | bigint;
  guardian: string;
  operation: Operation;
  calls: readonly { target: string; value: string | bigint; data: string }[];
  nonce: string | bigint;
  expiry: string | bigint;
}): RequestV1 {
  return parseRequestV1({
    schema: REQUEST_SCHEMA,
    chainId: input.chainId.toString(),
    guardian: input.guardian,
    operation: input.operation,
    calls: input.calls.map((call) => ({
      target: call.target,
      value: call.value.toString(),
      data: call.data,
    })),
    nonce: input.nonce.toString(),
    expiry: input.expiry.toString(),
  });
}
