import { encodeFunctionData, type Hex } from "viem";
import { bytesToHex } from "@qtape/schema";
import { registryAbi } from "./abi.js";
import { clientError } from "./errors.js";
import { bytesSha256, listSitePaths, manifestSha256, readSiteFileInfo } from "./files.js";
import { getProfile } from "./profiles.js";
import { createProviders, resolvePinnedBlock } from "./rpc.js";
import { readVaultFromProvider } from "./vault.js";
import type { PlanReleaseInput, PlannedCall, ReleaseBatch, ReleaseDiff, ReleaseFile, ReleaseLimits, ReleasePlan } from "./types.js";

export const DEFAULT_RELEASE_LIMITS: ReleaseLimits = {
  maxFileBytes: 1_048_576,
  maxSiteBytes: 5_242_880,
  chunkBytes: 12_000,
  maxCallsPerBatch: 16,
  maxChunksPerFile: 350,
  gasBudget: "8000000",
};

const EXECUTE_BASE_GAS = 3_000_000n;
const REGISTRY_CALL_BASE_GAS = 250_000n;
const STORAGE_GAS_PER_BYTE = 220n;
const OTHER_CALL_GAS = 150_000n;
const DEFAULT_EXPIRY_SECONDS = 300;

export interface ArtifactFile {
  path: string;
  content: Uint8Array;
}

export function normalizeSitePath(path: string): string {
  if (typeof path !== "string" || path.length === 0) clientError("FILE_INVALID", "file path is empty");
  if (path.includes("\0")) clientError("FILE_INVALID", "file path contains NUL");
  if (path.includes("\\")) clientError("FILE_INVALID", `file path contains backslash: ${path}`);
  if (path.startsWith("/")) clientError("FILE_INVALID", `file path is absolute: ${path}`);
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    clientError("FILE_INVALID", `file path escapes or is not canonical: ${path}`);
  }
  return segments.join("/");
}

export function prepareArtifact(files: readonly ArtifactFile[], limits: ReleaseLimits): ReleaseFile[] {
  if (files.length === 0) clientError("FILE_INVALID", "artifact contains no files");
  const seen = new Set<string>();
  const prepared = files.map((file) => {
    const path = normalizeSitePath(file.path);
    if (seen.has(path)) clientError("FILE_INVALID", `duplicate file path: ${path}`);
    seen.add(path);
    if (file.content.length > limits.maxFileBytes) {
      clientError("FILE_INVALID", `${path} is ${file.content.length} bytes, above ${limits.maxFileBytes}`);
    }
    const chunks = Math.max(1, Math.ceil(file.content.length / limits.chunkBytes));
    if (chunks > limits.maxChunksPerFile) {
      clientError("FILE_INVALID", `${path} needs ${chunks} chunks, above ${limits.maxChunksPerFile}`);
    }
    return {
      path,
      size: file.content.length,
      sha256: bytesSha256(file.content),
      chunks,
    };
  });
  const total = prepared.reduce((sum, file) => sum + file.size, 0);
  if (total > limits.maxSiteBytes) clientError("FILE_INVALID", `artifact is ${total} bytes, above ${limits.maxSiteBytes}`);
  return prepared.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

export async function planRelease(input: PlanReleaseInput): Promise<ReleasePlan> {
  const limits: ReleaseLimits = { ...DEFAULT_RELEASE_LIMITS, ...input.limits };
  assertLimits(limits);
  const profile = getProfile(input.profile);
  const providers = createProviders(input.rpcUrls ?? profile.runtimeRpcUrls, profile.chainId);
  const pinned = await resolvePinnedBlock(providers, input.baseBlock, profile.maxPinLag);
  const provider = providers[0]!;
  const artifact = prepareArtifact(input.files, limits);
  const vault = await readVaultFromProvider(provider, input.vault as Hex, pinned.number);
  if (vault.registry.toLowerCase() !== profile.siteRegistry.toLowerCase() || vault.binding.toLowerCase() !== profile.domainBinding.toLowerCase()) {
    clientError("CONFIG_CHANGED", "vault registry/binding do not match the selected profile");
  }
  if (input.nonce !== undefined && BigInt(input.nonce) !== BigInt(vault.nonce)) {
    clientError("NONCE_CONFLICT", `vault nonce changed: on-chain ${vault.nonce}, requested ${input.nonce}`);
  }

  const remotePaths = input.prune === false
    ? []
    : await listSitePaths(provider, profile.siteRegistry, vault.container, pinned.number);
  if (input.prune !== false) {
    const remotePathsSecond = await listSitePaths(providers[1]!, profile.siteRegistry, vault.container, pinned.number);
    if (JSON.stringify([...remotePaths].sort()) !== JSON.stringify([...remotePathsSecond].sort())) {
      clientError("RPC_DISAGREEMENT", "providers disagree on site path list");
    }
  }

  const diff: ReleaseDiff = { added: [], modified: [], deleted: [], unchanged: [] };
  const remoteInfoByPath = new Map<string, Awaited<ReturnType<typeof readSiteFileInfo>>>();
  for (const file of artifact) {
    const info = await readSiteFileInfo(provider, profile.siteRegistry, vault.container, file.path, pinned.number);
    const second = await readSiteFileInfo(providers[1]!, profile.siteRegistry, vault.container, file.path, pinned.number);
    if (JSON.stringify(info) !== JSON.stringify(second)) {
      clientError("RPC_DISAGREEMENT", `providers disagree on fileInfo for ${file.path}`);
    }
    remoteInfoByPath.set(file.path, info);
    if (!info) diff.added.push(file.path);
    else if (info.size !== file.size || info.sha256.toLowerCase() !== file.sha256.toLowerCase()) diff.modified.push(file.path);
    else diff.unchanged.push(file.path);
  }
  if (input.prune !== false) {
    const localPaths = new Set(artifact.map((file) => file.path));
    diff.deleted = remotePaths.filter((path) => !localPaths.has(path)).sort();
  }

  const warnings: string[] = [];
  const currentFallback = await provider.client.readContract({
    address: profile.siteRegistry,
    abi: registryAbi,
    functionName: "fallbackPath",
    args: [vault.container],
    blockNumber: pinned.number,
  });
  const secondFallback = await providers[1]!.client.readContract({
    address: profile.siteRegistry,
    abi: registryAbi,
    functionName: "fallbackPath",
    args: [vault.container],
    blockNumber: pinned.number,
  });
  if (currentFallback !== secondFallback) clientError("RPC_DISAGREEMENT", "providers disagree on fallback path");

  const calls: PlannedCall[] = [];
  const contentByPath = new Map(input.files.map((file) => [normalizeSitePath(file.path), file.content]));
  for (const path of [...diff.added, ...diff.modified].sort()) {
    const file = artifact.find((candidate) => candidate.path === path)!;
    const content = contentByPath.get(path)!;
    const chunks = splitChunks(content, limits.chunkBytes);
    calls.push({
      target: profile.siteRegistry,
      value: "0",
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: "putFile",
        args: [vault.container, path, contentTypeFor(path), file.sha256, bytesToHex(chunks[0] ?? new Uint8Array())],
      }),
      kind: "putFile",
      path,
    });
    for (let index = 1; index < chunks.length; index++) {
      calls.push({
        target: profile.siteRegistry,
        value: "0",
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "appendChunk",
          args: [vault.container, path, BigInt(index), bytesToHex(chunks[index]!)],
        }),
        kind: "appendChunk",
        path,
      });
    }
  }
  for (const path of diff.deleted) {
    calls.push({
      target: profile.siteRegistry,
      value: "0",
      data: encodeFunctionData({ abi: registryAbi, functionName: "removeFile", args: [vault.container, path] }),
      kind: "removeFile",
      path,
    });
  }

  if (input.fallbackPath !== undefined) {
    const fallbackPath = normalizeSitePath(input.fallbackPath);
    if (!artifact.some((file) => file.path === fallbackPath) && !remotePaths.includes(fallbackPath)) {
      clientError("FILE_INVALID", `fallback path ${fallbackPath} does not exist in artifact or site`);
    }
    if (fallbackPath !== currentFallback) {
      calls.push({
        target: profile.siteRegistry,
        value: "0",
        data: encodeFunctionData({ abi: registryAbi, functionName: "setFallback", args: [vault.container, fallbackPath] }),
        kind: "setFallback",
        path: fallbackPath,
      });
    }
  }

  if (currentFallback.length > 0 && !artifact.some((file) => file.path === currentFallback) && diff.deleted.includes(currentFallback)) {
    warnings.push(`current fallback ${currentFallback} is being deleted and no replacement fallback was provided`);
  }

  const batches = batchCalls(calls, limits);
  const expiry = input.expiry !== undefined
    ? BigInt(input.expiry)
    : pinned.timestamp + BigInt(DEFAULT_EXPIRY_SECONDS);
  if (expiry <= pinned.timestamp) clientError("INVALID_INPUT", "expiry must be in the future");
  if (expiry > pinned.timestamp + 3600n) clientError("INVALID_INPUT", "expiry is more than one hour ahead; re-plan closer to submission");

  return {
    schema: "qtape.releaseplan.v1",
    site: input.site,
    profile: profile.id,
    chainId: profile.chainId,
    vault: vault.address,
    container: vault.container,
    baseBlock: pinned.number.toString(),
    baseBlockHash: pinned.hash,
    files: artifact,
    manifestSha256: manifestSha256(input.site, artifact),
    diff,
    calls,
    batches,
    nonce: vault.nonce,
    expiry: expiry.toString(),
    limits,
    warnings,
  };
}

export function splitChunks(content: Uint8Array, chunkBytes: number): Uint8Array[] {
  if (content.length === 0) return [new Uint8Array()];
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < content.length; offset += chunkBytes) {
    chunks.push(content.slice(offset, Math.min(offset + chunkBytes, content.length)));
  }
  return chunks;
}

export function estimateCallGas(call: PlannedCall): bigint {
  if (call.kind === "putFile" || call.kind === "appendChunk") {
    const bytes = BigInt(Math.max(0, (call.data.length - 2) / 2));
    return REGISTRY_CALL_BASE_GAS + bytes * STORAGE_GAS_PER_BYTE;
  }
  return OTHER_CALL_GAS;
}

export function batchCalls(calls: readonly PlannedCall[], limits: ReleaseLimits): ReleaseBatch[] {
  const budget = BigInt(limits.gasBudget);
  const safety = (budget * 95n) / 100n;
  const batches: ReleaseBatch[] = [];
  let current: PlannedCall[] = [];
  let currentGas = EXECUTE_BASE_GAS;
  const flush = () => {
    if (current.length === 0) return;
    batches.push({ index: batches.length, calls: current, estimatedGas: currentGas.toString() });
    current = [];
    currentGas = EXECUTE_BASE_GAS;
  };
  for (const call of calls) {
    const callGas = estimateCallGas(call);
    const wouldExceed = currentGas + callGas > safety || current.length >= limits.maxCallsPerBatch;
    if (wouldExceed && current.length > 0) flush();
    if (EXECUTE_BASE_GAS + callGas > budget) {
      clientError("BUDGET_EXCEEDED", `single call ${call.kind}${call.path ? ` ${call.path}` : ""} exceeds gas budget; reduce chunk size`);
    }
    current.push(call);
    currentGas += callGas;
  }
  flush();
  return batches;
}

function assertLimits(limits: ReleaseLimits): void {
  if (limits.chunkBytes <= 0 || limits.chunkBytes > 24_000) clientError("INVALID_INPUT", "chunkBytes must be in 1..24000");
  if (limits.maxCallsPerBatch <= 0 || limits.maxCallsPerBatch > 16) clientError("INVALID_INPUT", "maxCallsPerBatch must be in 1..16");
  if (limits.maxChunksPerFile <= 0 || limits.maxChunksPerFile > 350) clientError("INVALID_INPUT", "maxChunksPerFile must be in 1..350");
  if (BigInt(limits.gasBudget) <= EXECUTE_BASE_GAS) clientError("INVALID_INPUT", "gasBudget is below Falcon execution overhead");
}

function contentTypeFor(path: string): string {
  const extension = path.toLowerCase().split(".").pop() ?? "";
  const types: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript",
    mjs: "text/javascript",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    wasm: "application/wasm",
    txt: "text/plain",
    xml: "application/xml",
    pdf: "application/pdf",
  };
  return types[extension] ?? "application/octet-stream";
}
