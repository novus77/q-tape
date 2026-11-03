#!/usr/bin/env bun
/**
 * M3.4 pilot approval + read-only readiness check. Never signs or broadcasts.
 *
 * Usage:
 *   bun scripts/m3-pilot.ts --approval ./pilot-approval.json --profile xlayer-196 \
 *     --rpc URL_A --rpc URL_B
 *   bun scripts/m3-pilot.ts --approval ./approval.json --profile-file ./fixture-profile.json
 */
import { readFileSync } from "node:fs";
import {
  checkPilotApproval,
  createProvider,
  getProfile,
  inspectSite,
  parsePilotApproval,
  readVaultState,
  registerProfile,
  type ChainProfile,
} from "../packages/client/src/index.ts";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}
function rpcArgs(): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--rpc" && args[index + 1]) values.push(args[index + 1]!);
  }
  return values;
}

const approvalPath = flag("approval");
if (!approvalPath) {
  console.error("--approval is required");
  process.exit(2);
}
const profileFile = flag("profile-file");
let profileId = flag("profile");
if (profileFile) {
  const loaded = JSON.parse(readFileSync(profileFile, "utf8")) as ChainProfile;
  registerProfile(loaded);
  profileId = loaded.id;
}
const profile = getProfile(profileId);
const approval = parsePilotApproval(JSON.parse(readFileSync(approvalPath, "utf8")));
const rpcUrls = rpcArgs().length > 0 ? rpcArgs() : approval.environment.rpcUrls;
const blockNumber = flag("block");
const deployer = flag("deployer") as `0x${string}` | undefined;

try {
  const inspection = await inspectSite({ site: approval.site, profile: profile.id, rpcUrls, blockNumber });
  const vault = approval.vault
    ? await readVaultState({ vault: approval.vault, profile: profile.id, rpcUrls, blockNumber })
    : undefined;
  const check = checkPilotApproval(approval, { profile, inspection, ...(vault ? { vault } : {}) });
  const warnings = [...check.warnings];
  if (deployer) {
    const provider = createProvider(rpcUrls[0]!, profile.chainId);
    const balance = await provider.client.getBalance({ address: deployer });
    const nonce = await provider.client.getTransactionCount({ address: deployer });
    warnings.push({ code: "DEPLOYER_INFO", message: `deployer balance=${balance} wei nonce=${nonce}` });
  }
  const result = {
    ok: check.ok,
    approval: {
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt,
      expiresAt: approval.expiresAt,
      site: approval.site,
      scope: approval.scope,
      limits: approval.limits,
      externalReview: approval.externalReview,
    },
    environment: { profile: profile.id, chainId: profile.chainId, rpcCount: rpcUrls.length },
    observed: {
      blockNumber: inspection.blockNumber,
      blockHash: inspection.blockHash,
      holder: inspection.holder,
      protection: inspection.protection,
      vault: inspection.vault?.address ?? null,
      tokenId: inspection.tokenId,
      container: inspection.container,
    },
    checks: check.errors,
    warnings,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!check.ok) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}

export {};
