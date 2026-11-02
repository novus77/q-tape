import { QtapeClientError } from "@qtape/client";
import { SignerError } from "@qtape/signer";
import { CancelledError, UsageError } from "./args.js";

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function errorCode(error: unknown): string {
  if (error instanceof QtapeClientError) return error.code;
  if (error instanceof SignerError) return error.code;
  if (error instanceof UsageError) return "USAGE";
  if (error instanceof CancelledError) return "CANCELLED";
  return "INTERNAL";
}

export function exitCodeFor(error: unknown): number {
  if (error instanceof CancelledError) return 2;
  return 1;
}

export function printError(error: unknown, json: boolean): void {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (json) printJson({ ok: false, error: { code, message } });
  else console.error(`${code}: ${message}`);
}
