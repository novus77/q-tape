export type SchemaErrorCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "MISSING_FIELD"
  | "INVALID_SCHEMA"
  | "INVALID_UINT256"
  | "INVALID_ADDRESS"
  | "INVALID_HEX"
  | "INVALID_OPERATION"
  | "EMPTY_CALLS"
  | "INVALID_PUBLIC_KEY"
  | "INVALID_SECRET_KEY"
  | "INVALID_ALGORITHM"
  | "INVALID_CREATED_AT"
  | "INVALID_SIGNATURE"
  | "INVALID_DIGEST";

export class SchemaError extends Error {
  readonly code: SchemaErrorCode;

  constructor(code: SchemaErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "SchemaError";
    this.code = code;
  }
}

export function schemaError(code: SchemaErrorCode, message: string): never {
  throw new SchemaError(code, message);
}
