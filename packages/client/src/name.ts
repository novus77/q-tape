import { clientError } from "./errors.js";

export interface ParsedTapeName {
  onChainName: string;
  tokenId: string;
  areaCode: number | null;
  processorNumber: number;
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;

export function parseTapeName(input: string): ParsedTapeName {
  if (typeof input !== "string" || input.length === 0) clientError("INVALID_INPUT", "site name is required");
  let value = input.trim().toLowerCase();
  if (value.startsWith("tape://") || value.startsWith("web+tape://")) {
    value = value.replace(/^(web\+)?tape:\/\//, "").split("/")[0] ?? "";
  }
  value = value.replace(/^#/, "");

  const display = /^([0-9]+)@(?:([0-9]+)\.)?([0-9]+)$/.exec(value);
  if (display) {
    return finish(display[1] ?? "", display[2] ?? null, display[3] ?? "");
  }

  const suffix = value.endsWith(".tape") ? value.slice(0, -5) : value;
  const parts = suffix.split(".");
  if (parts.length === 3) return finish(parts[0] ?? "", parts[1] ?? null, parts[2] ?? "");
  if (parts.length === 2) return finish(parts[0] ?? "", null, parts[1] ?? "");
  clientError("INVALID_INPUT", `unsupported tape name: ${input}`);
}

function finish(tokenIdText: string, areaCodeText: string | null, processorText: string): ParsedTapeName {
  if (!DECIMAL.test(tokenIdText) || !DECIMAL.test(processorText)) clientError("INVALID_INPUT", "name numbers must be canonical decimal");
  if (areaCodeText !== null && !DECIMAL.test(areaCodeText)) clientError("INVALID_INPUT", "area code must be decimal");
  const tokenId = BigInt(tokenIdText);
  const processorNumber = Number(processorText);
  if (tokenId < 1n || tokenId > 10n ** 18n) clientError("INVALID_INPUT", "token id out of range");
  if (!Number.isSafeInteger(processorNumber) || processorNumber < 0 || processorNumber > 1_000_000_000) {
    clientError("INVALID_INPUT", "processor number out of range");
  }
  const areaCode = areaCodeText === null ? null : Number(areaCodeText);
  const onChainName =
    areaCode === null
      ? `${tokenId}.${processorNumber}.tape`
      : `${tokenId}.${areaCode}.${processorNumber}.tape`;
  return { onChainName, tokenId: tokenId.toString(), areaCode, processorNumber };
}

export function displayLabel(parsed: ParsedTapeName): string {
  return parsed.areaCode === null
    ? `#${parsed.tokenId}@${parsed.processorNumber}`
    : `#${parsed.tokenId}@${parsed.areaCode}.${parsed.processorNumber}`;
}
