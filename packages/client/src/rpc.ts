import { createPublicClient, defineChain, http, type Hex, type PublicClient } from "viem";
import { clientError } from "./errors.js";

export interface ProviderContext {
  url: string;
  client: PublicClient;
  chainId: number;
}

export interface PinnedBlock {
  number: bigint;
  hash: Hex;
  timestamp: bigint;
}

export function createProvider(url: string, chainId: number): ProviderContext {
  const chain = defineChain({
    id: chainId,
    name: `qtape-${chainId}`,
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
  return { url, client: createPublicClient({ chain, transport: http(url, { timeout: 60_000 }) }), chainId };
}

export function createProviders(urls: readonly string[], chainId: number): ProviderContext[] {
  if (urls.length === 0) clientError("INVALID_INPUT", "at least one RPC URL is required");
  return urls.map((url) => createProvider(url, chainId));
}

export async function assertProviderChain(provider: ProviderContext): Promise<void> {
  const chainId = await provider.client.getChainId();
  if (chainId !== provider.chainId) {
    clientError("CHAIN_MISMATCH", `RPC ${provider.url} reports chain ${chainId}, expected ${provider.chainId}`);
  }
}

export async function resolvePinnedBlock(
  providers: readonly ProviderContext[],
  requested?: string | bigint,
  maxPinLag = 300,
): Promise<PinnedBlock> {
  if (providers.length < 2) clientError("INVALID_INPUT", "two independent RPC providers are required");
  await Promise.all(providers.map(assertProviderChain));
  const heads = await Promise.all(providers.map((provider) => provider.client.getBlockNumber()));
  const head = heads.reduce((min, value) => (value < min ? value : min));
  const spread = heads.reduce((max, value) => (value > max ? value : max)) - head;
  if (requested === undefined && spread > BigInt(maxPinLag)) {
    clientError("RPC_DISAGREEMENT", `provider heads differ by ${spread} blocks, above ${maxPinLag}`);
  }
  const blockNumber = requested !== undefined ? BigInt(requested) : head;
  const blocks = await Promise.all(
    providers.map(async (provider) => {
      const block = await provider.client.getBlock({ blockNumber });
      if (!block.hash) clientError("RPC_UNAVAILABLE", `missing block hash at ${blockNumber} from ${provider.url}`);
      return block;
    }),
  );
  const first = blocks[0];
  if (!first) clientError("RPC_UNAVAILABLE", "no block read");
  for (const block of blocks.slice(1)) {
    if (block.hash !== first.hash) {
      clientError("RPC_DISAGREEMENT", `providers disagree on block ${blockNumber}: ${first.hash} vs ${block.hash}`);
    }
  }
  if (head - blockNumber > BigInt(maxPinLag)) {
    clientError("RPC_DISAGREEMENT", `pinned block ${blockNumber} lags head ${head} by more than ${maxPinLag}`);
  }
  return { number: blockNumber, hash: first.hash, timestamp: first.timestamp };
}

export async function readImplementationSlot(
  provider: ProviderContext,
  address: Hex,
  blockNumber: bigint,
): Promise<Hex> {
  const slot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const value = await provider.client.getStorageAt({ address, slot, blockNumber });
  if (!value) clientError("RPC_UNAVAILABLE", `missing implementation slot for ${address}`);
  return `0x${value.slice(-40)}`.toLowerCase() as Hex;
}
