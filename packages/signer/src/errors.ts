export type SignerErrorCode =
  | "INVALID_PASSPHRASE"
  | "CORRUPT_BUNDLE"
  | "INVALID_KEY_BUNDLE"
  | "SIGNER_UNAVAILABLE"
  | "SIGNER_FAILED"
  | "VERIFICATION_FAILED"
  | "BACKUP_VERIFICATION_FAILED";

export class SignerError extends Error {
  readonly code: SignerErrorCode;

  constructor(code: SignerErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "SignerError";
    this.code = code;
  }
}

export function signerError(code: SignerErrorCode, message: string): never {
  throw new SignerError(code, message);
}
