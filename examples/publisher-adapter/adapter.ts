/**
 * Example publishing-tool adapter (not a third-party integration).
 *
 * A build tool can call this module with a directory of fixed artifacts and a
 * locally decrypted key bundle. The adapter returns unsigned requests; the tool
 * must ask the local signer to approve/sign each one, then hand the exact
 * SignedRequestV1 to a relayer or wallet. It never receives a Falcon private
 * key and never substitutes a second transaction encoding.
 */
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, relative } from "node:path";
import { planRelease, type ReleasePlan } from "@qtape/client";
import { createRequestV1, type SignedRequestV1 } from "@qtape/schema";
import { encodeRequest } from "@qtape/protocol";
import { readKeyBundle, signDigest } from "@qtape/signer";

export interface AdapterInput {
  site: string;
  vault: string;
  artifactDir: string;
  keyBundlePath: string;
  passphrase: string;
}

export async function buildReleasePlan(input: AdapterInput, rpcUrls: string[]): Promise<ReleasePlan> {
  return await planRelease({
    site: input.site,
    vault: input.vault,
    files: readArtifactDirectory(input.artifactDir),
    rpcUrls,
  });
}

function readArtifactDirectory(root: string): { path: string; content: Uint8Array }[] {
  const files: { path: string; content: Uint8Array }[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      if (entry === ".DS_Store") continue;
      const absolute = join(directory, entry);
      const stats = lstatSync(absolute);
      if (stats.isSymbolicLink()) throw new Error(`symlink not allowed: ${absolute}`);
      if (stats.isDirectory()) walk(absolute);
      else if (stats.isFile()) files.push({ path: relative(root, absolute).split("\\").join("/"), content: new Uint8Array(readFileSync(absolute)) });
    }
  };
  walk(root);
  return files;
}

export async function signPlanBatch(plan: ReleasePlan, keyBundlePath: string, passphrase: string, batchIndex = 0): Promise<SignedRequestV1> {
  const batch = plan.batches[batchIndex];
  if (!batch) throw new Error(`plan has no batch ${batchIndex}`);
  const bundle = await readKeyBundle(keyBundlePath, passphrase);
  const request = createRequestV1({
    chainId: plan.chainId.toString(),
    guardian: plan.vault,
    operation: 0,
    calls: batch.calls,
    nonce: (BigInt(plan.nonce) + BigInt(batchIndex)).toString(),
    expiry: plan.expiry,
  });
  const { digest } = encodeRequest(request);
  return { request, signature: await signDigest({ digest, bundle }), digest };
}
