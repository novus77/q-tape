import {
  parseAddress,
  parseBytes32,
  parseUint256,
  requireObject,
  type Hex,
} from "@qtape/schema";
import { clientError } from "./errors.js";
import { parseTapeName } from "./name.js";
import type { ChainProfile } from "./types.js";

export const PILOT_APPROVAL_SCHEMA = "qtape.pilot-approval.v1" as const;
export const PILOT_MAX_GAS_PER_REQUEST = 8_000_000n;

export const PILOT_OPERATIONS = ["DEPLOY", "DEPOSIT", "PUBLISH", "RENEW", "ROTATE", "EXIT"] as const;
export type PilotOperation = (typeof PILOT_OPERATIONS)[number];

export interface PilotApproval {
  schema: typeof PILOT_APPROVAL_SCHEMA;
  approvedBy: string;
  approvedAt: string;
  environment: {
    name: string;
    chainId: string;
    rpcUrls: string[];
  };
  site: string;
  vault?: Hex;
  nft: Hex;
  tokenId: string;
  container: Hex;
  scope: PilotOperation[];
  limits: {
    maxGasPerRequest: string;
    maxTotalGas: string;
    maxValue: string;
  };
  externalReview: {
    status: "passed";
    reportHash: Hex;
    reviewedCommit: string;
  };
  expiresAt: string;
}

export interface PilotApprovalContext {
  profile: ChainProfile;
  now?: Date;
  inspection?: { site: string; container: Hex; tokenId: string; vault: { address: Hex } | null };
  vault?: { address: Hex; container: Hex; tokenId: string };
}

export interface PilotApprovalIssue {
  code: string;
  message: string;
}

export interface PilotApprovalCheck {
  ok: boolean;
  errors: PilotApprovalIssue[];
  warnings: PilotApprovalIssue[];
}

const TOP_FIELDS = ["schema", "approvedBy", "approvedAt", "environment", "site", "vault", "nft", "tokenId", "container", "scope", "limits", "externalReview", "expiresAt"] as const;
const REQUIRED_TOP_FIELDS = TOP_FIELDS.filter((field) => field !== "vault");
const ENVIRONMENT_FIELDS = ["name", "chainId", "rpcUrls"] as const;
const LIMIT_FIELDS = ["maxGasPerRequest", "maxTotalGas", "maxValue"] as const;
const REVIEW_FIELDS = ["status", "reportHash", "reviewedCommit"] as const;

export function parsePilotApproval(input: unknown): PilotApproval {
  const record = requireOptionalObject(input, REQUIRED_TOP_FIELDS, ["vault"], "pilotApproval");
  if (record.schema !== PILOT_APPROVAL_SCHEMA) clientError("INVALID_INPUT", `pilot approval schema must be ${PILOT_APPROVAL_SCHEMA}`);
  if (typeof record.approvedBy !== "string" || record.approvedBy.trim().length === 0) clientError("INVALID_INPUT", "approvedBy is required");
  const approvedAt = parseIsoDate(record.approvedAt, "approvedAt");
  const expiresAt = parseIsoDate(record.expiresAt, "expiresAt");
  if (expiresAt.getTime() <= approvedAt.getTime()) clientError("INVALID_INPUT", "expiresAt must be after approvedAt");

  const environmentRecord = requireObject(record.environment, ENVIRONMENT_FIELDS, "pilotApproval.environment");
  if (typeof environmentRecord.name !== "string" || environmentRecord.name.length === 0) clientError("INVALID_INPUT", "environment.name is required");
  if (!Array.isArray(environmentRecord.rpcUrls) || environmentRecord.rpcUrls.length < 2) {
    clientError("INVALID_INPUT", "environment.rpcUrls must contain at least two independent endpoints");
  }
  const rpcUrls = environmentRecord.rpcUrls.map((url) => {
    if (typeof url !== "string") clientError("INVALID_INPUT", "environment.rpcUrls must be strings");
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocol");
    } catch {
      clientError("INVALID_INPUT", `invalid RPC URL: ${url}`);
    }
    return url;
  });

  const parsedName = parseTapeName(String(record.site));
  const nft = parseAddress(record.nft, "nft");
  const container = parseAddress(record.container, "container");
  const tokenId = parseUint256(record.tokenId, "tokenId");
  if (BigInt(tokenId) === 0n) clientError("INVALID_INPUT", "tokenId must be non-zero");
  const vault = record.vault === undefined ? undefined : parseAddress(record.vault, "vault");

  if (!Array.isArray(record.scope) || record.scope.length === 0) clientError("INVALID_INPUT", "scope must contain at least EXIT");
  const scope = [...new Set(record.scope.map((value) => parsePilotOperation(value)))];
  if (!scope.includes("EXIT")) clientError("INVALID_INPUT", "pilot scope must include EXIT so the user can leave protection");

  const limitsRecord = requireObject(record.limits, LIMIT_FIELDS, "pilotApproval.limits");
  const maxGasPerRequest = parseUint256(limitsRecord.maxGasPerRequest, "limits.maxGasPerRequest");
  const maxTotalGas = parseUint256(limitsRecord.maxTotalGas, "limits.maxTotalGas");
  const maxValue = parseUint256(limitsRecord.maxValue, "limits.maxValue");
  if (BigInt(maxGasPerRequest) > PILOT_MAX_GAS_PER_REQUEST) {
    clientError("INVALID_INPUT", `limits.maxGasPerRequest exceeds ${PILOT_MAX_GAS_PER_REQUEST}`);
  }
  if (BigInt(maxTotalGas) === 0n) clientError("INVALID_INPUT", "limits.maxTotalGas must be non-zero");

  const reviewRecord = requireObject(record.externalReview, REVIEW_FIELDS, "pilotApproval.externalReview");
  if (reviewRecord.status !== "passed") clientError("INVALID_INPUT", "externalReview.status must be passed");
  const reportHash = parseBytes32(reviewRecord.reportHash, "externalReview.reportHash");
  if (typeof reviewRecord.reviewedCommit !== "string" || !/^[0-9a-fA-F]{40}$/.test(reviewRecord.reviewedCommit)) {
    clientError("INVALID_INPUT", "externalReview.reviewedCommit must be a 40-character hex commit");
  }
  const reviewedCommit = reviewRecord.reviewedCommit;

  return {
    schema: PILOT_APPROVAL_SCHEMA,
    approvedBy: record.approvedBy,
    approvedAt: approvedAt.toISOString(),
    environment: { name: environmentRecord.name, chainId: parseUint256(environmentRecord.chainId, "environment.chainId"), rpcUrls },
    site: parsedName.onChainName,
    ...(vault === undefined ? {} : { vault }),
    nft,
    tokenId,
    container,
    scope,
    limits: { maxGasPerRequest, maxTotalGas, maxValue },
    externalReview: { status: "passed", reportHash, reviewedCommit },
    expiresAt: expiresAt.toISOString(),
  };
}

export function checkPilotApproval(approval: PilotApproval, context: PilotApprovalContext): PilotApprovalCheck {
  const errors: PilotApprovalIssue[] = [];
  const warnings: PilotApprovalIssue[] = [];
  const now = context.now ?? new Date();
  const approvedAt = new Date(approval.approvedAt);
  const expiresAt = new Date(approval.expiresAt);
  if (now < approvedAt) errors.push({ code: "NOT_YET_VALID", message: `approval starts at ${approval.approvedAt}` });
  if (now > expiresAt) errors.push({ code: "EXPIRED", message: `approval expired at ${approval.expiresAt}` });
  if (BigInt(approval.environment.chainId) !== BigInt(context.profile.chainId)) {
    errors.push({ code: "CHAIN_MISMATCH", message: `approval chain ${approval.environment.chainId} != profile ${context.profile.chainId}` });
  }
  if (approval.vault && context.vault && approval.vault.toLowerCase() !== context.vault.address.toLowerCase()) {
    errors.push({ code: "VAULT_MISMATCH", message: `approval vault ${approval.vault} != observed ${context.vault.address}` });
  }
  if (context.inspection) {
    if (approval.site !== context.inspection.site) errors.push({ code: "SITE_MISMATCH", message: `approval site ${approval.site} != observed ${context.inspection.site}` });
    if (approval.container.toLowerCase() !== context.inspection.container.toLowerCase()) errors.push({ code: "CONTAINER_MISMATCH", message: "approval container does not match observed container" });
    if (approval.tokenId !== context.inspection.tokenId) errors.push({ code: "TOKEN_MISMATCH", message: "approval tokenId does not match observed tokenId" });
    if (approval.vault && context.inspection.vault && approval.vault.toLowerCase() !== context.inspection.vault.address.toLowerCase()) {
      errors.push({ code: "VAULT_MISMATCH", message: "approval vault does not match observed vault" });
    }
    if (!context.inspection.vault && approval.scope.some((operation) => ["PUBLISH", "RENEW", "ROTATE", "EXIT"].includes(operation))) {
      errors.push({ code: "VAULT_NOT_PROTECTED", message: "approval includes protected operations but no matching Vault was observed" });
    }
  }
  if (approval.scope.includes("EXIT") && !context.vault && !context.inspection?.vault) {
    warnings.push({ code: "EXIT_REQUIRES_VAULT", message: "EXIT is in scope but no live Vault was observed at preflight" });
  }
  return { ok: errors.length === 0, errors, warnings };
}

function requireOptionalObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) clientError("INVALID_INPUT", `${label} must be an object`);
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) clientError("INVALID_INPUT", `${label} has unknown field ${key}`);
  }
  for (const key of required) {
    if (!(key in record)) clientError("INVALID_INPUT", `${label} is missing field ${key}`);
  }
  return record;
}

function parsePilotOperation(value: unknown): PilotOperation {
  if (typeof value !== "string" || !(PILOT_OPERATIONS as readonly string[]).includes(value)) {
    clientError("INVALID_INPUT", `unsupported pilot operation ${String(value)}`);
  }
  return value as PilotOperation;
}

function parseIsoDate(value: unknown, field: string): Date {
  if (typeof value !== "string") clientError("INVALID_INPUT", `${field} must be an ISO 8601 string`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) clientError("INVALID_INPUT", `${field} must be a valid ISO 8601 date`);
  return date;
}
