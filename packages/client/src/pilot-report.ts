import type { PilotApproval } from "./pilot.js";

export const PILOT_REPORT_SCHEMA = "qtape.pilot-report.v1" as const;

export interface PilotReportEvidence {
  fixtureOnly: boolean;
  publicChainTransactionsBroadcast: number;
  lastBlock: string;
  releaseBatches: number;
  files: { path: string; ok: boolean }[];
  steps: string[];
}

export interface PilotReportInput {
  environment: { profile: string; chainId: number };
  evidence: PilotReportEvidence;
  approval?: PilotApproval;
  generatedAt?: string;
}

export interface PilotReport {
  schema: typeof PILOT_REPORT_SCHEMA;
  generatedAt: string;
  status: "LOCAL_VERIFIED" | "INCOMPLETE";
  environment: { profile: string; chainId: number };
  approval: { approvedBy: string; reportHash: string; reviewedCommit: string; expiresAt: string } | null;
  evidence: PilotReportEvidence;
  errors: string[];
  limitations: string[];
}

const REQUIRED_STEPS = ["deposit-and-protected", "release-verified", "key-rotated", "exited"];

export function buildPilotReport(input: PilotReportInput): PilotReport {
  const errors: string[] = [];
  if (!input.evidence.fixtureOnly) errors.push("pilot report is local-fixture only; non-fixture evidence is not accepted by this builder");
  if (input.evidence.publicChainTransactionsBroadcast !== 0) errors.push("public chain broadcasts are not allowed in a local pilot report");
  if (input.evidence.files.length === 0) errors.push("no release files were verified");
  if (input.evidence.files.some((file) => !file.ok)) errors.push("one or more release files failed verification");
  const hasDeposit = input.evidence.steps.includes("deposit-and-protected") || input.evidence.steps.includes("inspect-after-deposit");
  if (!hasDeposit) errors.push("missing required step: deposit-and-protected");
  for (const step of REQUIRED_STEPS.filter((value) => value !== "deposit-and-protected")) {
    if (!input.evidence.steps.includes(step)) errors.push(`missing required step: ${step}`);
  }
  if (BigInt(input.evidence.lastBlock) < 0n) errors.push("lastBlock is invalid");
  return {
    schema: PILOT_REPORT_SCHEMA,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: errors.length === 0 ? "LOCAL_VERIFIED" : "INCOMPLETE",
    environment: input.environment,
    approval: input.approval
      ? {
          approvedBy: input.approval.approvedBy,
          reportHash: input.approval.externalReview.reportHash,
          reviewedCommit: input.approval.externalReview.reviewedCommit,
          expiresAt: input.approval.expiresAt,
        }
      : null,
    evidence: input.evidence,
    errors,
    limitations: [
      "local fixture evidence only; not an official protocol compatibility proof",
      "not an independent security audit",
      "no public-chain deployment, real NFT migration or real user key",
    ],
  };
}
