import { sha256, stringToBytes, type Hex } from "viem";
import { registryAbi } from "./abi.js";
import { clientError } from "./errors.js";
import type { ProviderContext } from "./rpc.js";
import type { ReleaseFile, SiteFileInfo } from "./types.js";

export const READ_RANGE_BYTES = 98_304;

export async function readSiteFileInfo(
  provider: ProviderContext,
  registry: Hex,
  container: Hex,
  path: string,
  blockNumber: bigint,
): Promise<SiteFileInfo | null> {
  const [size, contentType, digest, updatedAt, chunkCount] = await provider.client.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "fileInfo",
    args: [container, path],
    blockNumber,
  });
  if (chunkCount === 0n) return null;
  return {
    path,
    size: Number(size),
    contentType,
    sha256: digest,
    updatedAt: updatedAt.toString(),
    chunkCount: Number(chunkCount),
  };
}

export async function readSiteFileBytes(
  provider: ProviderContext,
  registry: Hex,
  container: Hex,
  path: string,
  blockNumber: bigint,
): Promise<Uint8Array> {
  const info = await readSiteFileInfo(provider, registry, container, path, blockNumber);
  if (!info) clientError("FILE_INVALID", `file ${path} does not exist`);
  if (info.size <= READ_RANGE_BYTES) {
    const bytes = await provider.client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "read",
      args: [container, path],
      blockNumber,
    });
    return hexToBytes(bytes);
  }
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < info.size; offset += READ_RANGE_BYTES) {
    const bytes = await provider.client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "readRange",
      args: [container, path, BigInt(offset), BigInt(READ_RANGE_BYTES)],
      blockNumber,
    });
    chunks.push(hexToBytes(bytes));
  }
  return concatBytes(chunks);
}

export async function listSitePaths(
  provider: ProviderContext,
  registry: Hex,
  container: Hex,
  blockNumber: bigint,
  cap = 5000,
): Promise<string[]> {
  const count = Number(
    await provider.client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "pathCount",
      args: [container],
      blockNumber,
    }),
  );
  if (count > cap) clientError("FILE_INVALID", `site has ${count} paths, above enumeration cap ${cap}`);
  const paths: string[] = [];
  for (let offset = 0; offset < count; offset += 200) {
    const batch = await provider.client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "pathsRange",
      args: [container, BigInt(offset), BigInt(Math.min(200, count - offset))],
      blockNumber,
    });
    paths.push(...batch);
  }
  return paths;
}

export function manifestSha256(site: string, files: readonly ReleaseFile[]): Hex {
  const canonical = JSON.stringify({
    site,
    files: [...files]
      .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
      .map((file) => ({ path: file.path, size: file.size, sha256: file.sha256, chunks: file.chunks })),
  });
  return sha256(stringToBytes(canonical));
}

export function bytesSha256(bytes: Uint8Array): Hex {
  return sha256(bytes);
}

export function hexToBytes(value: Hex): Uint8Array {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) clientError("FILE_INVALID", "invalid hex bytes");
  const bytes = new Uint8Array((value.length - 2) / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(value.slice(2 + index * 2, 4 + index * 2), 16);
  }
  return bytes;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
