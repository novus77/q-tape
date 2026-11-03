#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { buildPilotReport, parsePilotApproval } from "../packages/client/src/index.ts";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}
const resultPath = flag("result");
if (!resultPath) {
  console.error("--result is required");
  process.exit(2);
}
const result = JSON.parse(readFileSync(resultPath, "utf8")) as {
  fixtureOnly?: boolean;
  publicChainTransactionsBroadcast?: number;
  profile?: { id?: string; chainId?: number };
  records?: { step: string; data?: { files?: { path: string; ok: boolean }[]; blockNumber?: string } }[];
};
const records = result.records ?? [];
const verification = records.find((record) => record.step === "release-verified")?.data;
const approvalPath = flag("approval");
const approval = approvalPath ? parsePilotApproval(JSON.parse(readFileSync(approvalPath, "utf8"))) : undefined;
const releaseBatches = records.filter((record) => record.step.startsWith("publish-batch-")).length;
const report = buildPilotReport({
  environment: { profile: result.profile?.id ?? "unknown", chainId: result.profile?.chainId ?? 0 },
  evidence: {
    fixtureOnly: result.fixtureOnly === true,
    publicChainTransactionsBroadcast: result.publicChainTransactionsBroadcast ?? -1,
    lastBlock: verification?.blockNumber ?? "0",
    releaseBatches,
    files: verification?.files ?? [],
    steps: records.map((record) => record.step),
  },
  ...(approval ? { approval } : {}),
});
const output = JSON.stringify(report, null, 2) + "\n";
const out = flag("out");
if (out) await Bun.write(out, output);
console.log(output);
if (report.status !== "LOCAL_VERIFIED") process.exitCode = 1;
