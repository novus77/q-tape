export type RelayErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_SIGNATURE"
  | "NONCE_CONFLICT"
  | "EXPIRED"
  | "UNSUPPORTED_PROFILE"
  | "RPC_DISAGREEMENT"
  | "SIMULATION_FAILED"
  | "BUDGET_EXCEEDED"
  | "NOT_FOUND"
  | "INTERNAL";

export class RelayError extends Error {
  readonly code: RelayErrorCode;
  readonly httpStatus: number;

  constructor(code: RelayErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = "RelayError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
