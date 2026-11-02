import { bytesSha256, manifestSha256, readSiteFileBytes, readSiteFileInfo } from "./files.js";
import { clientError } from "./errors.js";
import { getProfile } from "./profiles.js";
import { createProviders, resolvePinnedBlock } from "./rpc.js";
import type { VerifiedFile, VerificationResult, VerifyReleaseInput } from "./types.js";

export async function verifyRelease(input: VerifyReleaseInput): Promise<VerificationResult> {
  const plan = input.plan;
  const profile = getProfile(plan.profile);
  if (input.rpcUrls.length < 2) clientError("INVALID_INPUT", "release verification requires two independent RPC providers");
  const providers = createProviders(input.rpcUrls, profile.chainId);
  const pinned = await resolvePinnedBlock(providers, input.blockNumber, profile.maxPinLag);
  const errors: string[] = [];
  const files: VerifiedFile[] = [];

  const expectedManifest = manifestSha256(plan.site, plan.files);
  if (expectedManifest.toLowerCase() !== plan.manifestSha256.toLowerCase()) {
    errors.push(`plan manifest hash ${plan.manifestSha256} does not match computed ${expectedManifest}`);
  }

  for (const file of plan.files) {
    const reads = await Promise.all(
      providers.map((provider) => readSiteFileInfo(provider, profile.siteRegistry, plan.container, file.path, pinned.number)),
    );
    const first = reads[0];
    for (const other of reads.slice(1)) {
      if (JSON.stringify(first) !== JSON.stringify(other)) {
        errors.push(`providers disagree on fileInfo for ${file.path}`);
      }
    }
    if (!first) {
      files.push({
        path: file.path,
        expectedSize: file.size,
        actualSize: null,
        expectedSha256: file.sha256,
        actualSha256: null,
        ok: false,
      });
      errors.push(`missing file ${file.path}`);
      continue;
    }
    const bytes = await readSiteFileBytes(providers[0]!, profile.siteRegistry, plan.container, file.path, pinned.number);
    const digest = bytesSha256(bytes);
    const ok = first.size === file.size && digest.toLowerCase() === file.sha256.toLowerCase() && first.sha256.toLowerCase() === file.sha256.toLowerCase();
    files.push({
      path: file.path,
      expectedSize: file.size,
      actualSize: first.size,
      expectedSha256: file.sha256,
      actualSha256: digest,
      ok,
    });
    if (!ok) errors.push(`file ${file.path} does not match manifest (size ${first.size}/${file.size}, sha256 ${digest}/${file.sha256})`);
  }

  for (const path of plan.diff.deleted) {
    for (const provider of providers) {
      const info = await readSiteFileInfo(provider, profile.siteRegistry, plan.container, path, pinned.number);
      if (info) errors.push(`deleted path ${path} still exists`);
    }
  }

  if (errors.some((message) => message.startsWith("providers disagree"))) {
    return { status: "RPC_DISAGREEMENT", blockNumber: pinned.number.toString(), blockHash: pinned.hash, files, errors };
  }
  return {
    status: errors.length === 0 ? "VERIFIED" : "FAILED",
    blockNumber: pinned.number.toString(),
    blockHash: pinned.hash,
    files,
    errors,
  };
}
