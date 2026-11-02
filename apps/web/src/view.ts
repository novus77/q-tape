import type { ProtectionStatus, SiteInspection } from "@qtape/client";

export function protectionTone(status: ProtectionStatus): "ok" | "warn" | "danger" | "muted" {
  switch (status) {
    case "PROTECTED":
      return "ok";
    case "UNPROTECTED":
    case "VAULT_PREPARED":
    case "DEPOSITED_UNVERIFIED":
      return "warn";
    case "CONFIG_CHANGED":
    case "UNSUPPORTED":
      return "danger";
    case "EXITED":
      return "muted";
    default:
      return "muted";
  }
}

export function shortAddress(value: string, size = 6): string {
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}…${value.slice(-size)}`;
}

export function inspectionRows(site: SiteInspection): { label: string; value: string }[] {
  return [
    { label: "Site", value: site.site },
    { label: "Chain", value: String(site.chainId) },
    { label: "Observed block", value: `${site.blockNumber} (${site.blockHash.slice(0, 10)}…)` },
    { label: "Processor", value: site.processor },
    { label: "Container", value: site.container },
    { label: "Holder", value: site.holder },
    { label: "Opened", value: site.opened ? "yes" : "no" },
    { label: "Activation", value: site.live ? `paid${site.paidUntil ? ` until ${site.paidUntil}` : ""}` : "not paid" },
    { label: "Protection", value: site.protection },
  ];
}

export interface PreparedTransaction {
  chainId: number;
  to: string | null;
  data: string;
  value: string;
  expectedAddress?: string;
}

export function validatePreparedTransaction(input: unknown, expectedChainId: number): { ok: true; transaction: PreparedTransaction } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "prepared transaction must be an object" };
  const record = input as Record<string, unknown>;
  if (record.chainId !== expectedChainId) return { ok: false, error: `chainId must be ${expectedChainId}` };
  if (record.to !== null && typeof record.to !== "string") return { ok: false, error: "to must be null for deployment" };
  if (typeof record.data !== "string" || !/^0x[0-9a-fA-F]*$/.test(record.data) || record.data.length < 10) {
    return { ok: false, error: "data must be deploy bytecode hex" };
  }
  if (typeof record.value !== "string" && typeof record.value !== "number") return { ok: false, error: "value is required" };
  const value = String(record.value);
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return { ok: false, error: "value must be a decimal string" };
  return {
    ok: true,
    transaction: {
      chainId: record.chainId,
      to: record.to,
      data: record.data,
      value,
      ...(typeof record.expectedAddress === "string" ? { expectedAddress: record.expectedAddress } : {}),
    },
  };
}

export function verificationSummary(result: { status: string; blockNumber: string; errors: string[] }): string {
  if (result.status === "VERIFIED") return `Verified at block ${result.blockNumber}`;
  if (result.status === "RPC_DISAGREEMENT") return "RPC operators disagree; verification stopped";
  return `Verification failed with ${result.errors.length} issue(s)`;
}
