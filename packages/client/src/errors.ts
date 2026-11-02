export type ClientErrorCode =
  | "INVALID_INPUT"
  | "CHAIN_MISMATCH"
  | "UNSUPPORTED_PROFILE"
  | "CONFIG_CHANGED"
  | "NOT_TAPEOUT"
  | "NO_SUCH_CPU"
  | "NO_SUCH_TOKEN"
  | "NOT_OPENED"
  | "RPC_DISAGREEMENT"
  | "RPC_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "INVALID_SIGNATURE"
  | "NONCE_CONFLICT"
  | "EXPIRED"
  | "SIMULATION_FAILED"
  | "BUDGET_EXCEEDED"
  | "FILE_INVALID"
  | "VERIFICATION_FAILED"
  | "IO_ERROR";

export class QtapeClientError extends Error {
  readonly code: ClientErrorCode;
  readonly details?: unknown;

  constructor(code: ClientErrorCode, message: string, details?: unknown) {
    super(`${code}: ${message}`);
    this.name = "QtapeClientError";
    this.code = code;
    this.details = details;
  }
}

export function clientError(code: ClientErrorCode, message: string, details?: unknown): never {
  throw new QtapeClientError(code, message, details);
}
