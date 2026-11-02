import { encodeDeployData, encodeFunctionData, getContractAddress, keccak256, stringToHex, type Hex } from "viem";
import { guardianAbi, nftAbi } from "./abi.js";
import { clientError } from "./errors.js";
import { parseTapeName } from "./name.js";
import { getProfile } from "./profiles.js";
import { createProviders, resolvePinnedBlock } from "./rpc.js";
import type { DepositPlan, VaultPrepareInput, VaultState, PreparedVault } from "./types.js";

export interface ReadVaultInput {
  vault: string;
  profile?: string;
  rpcUrls?: string[];
  blockNumber?: string | bigint;
}

export async function readVaultState(input: ReadVaultInput): Promise<VaultState> {
  const profile = getProfile(input.profile);
  const providers = createProviders(input.rpcUrls ?? profile.runtimeRpcUrls, profile.chainId);
  const address = input.vault as Hex;
  if (providers.length === 1) {
    const block = input.blockNumber === undefined
      ? await providers[0]!.client.getBlock({ blockTag: "latest" })
      : await providers[0]!.client.getBlock({ blockNumber: BigInt(input.blockNumber) });
    return readVaultFromProvider(providers[0]!, address, block.number);
  }
  const pinned = await resolvePinnedBlock(providers, input.blockNumber, profile.maxPinLag);
  return readVaultFromProvider(providers[0]!, address, pinned.number);
}

export async function readVaultFromProvider(
  provider: import("./rpc.js").ProviderContext,
  address: Hex,
  blockNumber: bigint,
): Promise<VaultState> {
  const code = await provider.client.getCode({ address, blockNumber });
  if (!code || code === "0x") clientError("INVALID_INPUT", `no contract code at ${address}`);
  const [verifier, nft, tokenId, container, registry, binding, canonicalNameHash, publicKey, keyFingerprint, nonce] =
    await Promise.all([
      provider.client.readContract({ address, abi: guardianAbi, functionName: "verifier", blockNumber }),
      provider.client.readContract({ address, abi: guardianAbi, functionName: "nft", blockNumber }),
      provider.client.readContract({ address, abi: guardianAbi, functionName: "tokenId", blockNumber }),
      provider.client.readContract({ address, abi: guardianAbi, functionName: "container", blockNumber }),
      provider.client.readContract({ address, abi: guardianAbi, functionName: "registry", blockNumber }),
      provider.client.readContract({ address, abi: guardianAbi, functionName: "binding", blockNumber }),
      provider.client.readContract({ address, abi: guardianAbi, functionName: "canonicalNameHash", blockNumber }),
      provider.client.readContract({ address, abi: guardianAbi, functionName: "publicKey", blockNumber }),
      provider.client.readContract({ address, abi: guardianAbi, functionName: "keyFingerprint", blockNumber }),
      provider.client.readContract({ address, abi: guardianAbi, functionName: "nonce", blockNumber }),
    ]);
  const holder = await provider.client.readContract({ address: nft, abi: nftAbi, functionName: "ownerOf", args: [tokenId], blockNumber });
  return {
    address,
    verifier,
    nft,
    tokenId: tokenId.toString(),
    container,
    registry,
    binding,
    canonicalNameHash,
    publicKey,
    keyFingerprint,
    nonce: nonce.toString(),
    holder,
    deployed: true,
  };
}

export function prepareVault(input: VaultPrepareInput): PreparedVault {
  const profile = getProfile(input.profile);
  const parsed = parseTapeName(input.name);
  if (parsed.areaCode !== profile.areaCode) clientError("CHAIN_MISMATCH", `name ${parsed.onChainName} is not on ${profile.id}`);
  const nonce = BigInt(input.deployerNonce);
  if (nonce < 0n) clientError("INVALID_INPUT", "deployer nonce must be non-negative");
  const predictedAddress = getContractAddress({ from: input.deployer, nonce });
  const nameHash = keccak256(stringToHex(parsed.onChainName));
  const constructorArgs = [
    input.verifier,
    input.nft,
    BigInt(input.tokenId),
    input.container,
    profile.siteRegistry,
    profile.domainBinding,
    nameHash,
    input.publicKey,
    input.keyChallenge,
    input.keyProof,
  ] as const;
  const data = encodeDeployData({
    abi: input.artifact.abi,
    bytecode: input.artifact.bytecode,
    args: [...constructorArgs],
  });
  return {
    predictedAddress,
    constructorArgs,
    transaction: { chainId: profile.chainId, to: null, data, value: "0", expectedAddress: predictedAddress },
  };
}

export function buildDepositPlan(input: {
  profile?: string;
  vault: string;
  nft: string;
  tokenId: string;
  from: string;
}): DepositPlan {
  const profile = getProfile(input.profile);
  const data = encodeFunctionData({
    abi: nftAbi,
    functionName: "safeTransferFrom",
    args: [input.from as Hex, input.vault as Hex, BigInt(input.tokenId)],
  });
  return {
    vault: input.vault as Hex,
    nft: input.nft as Hex,
    tokenId: input.tokenId,
    from: input.from as Hex,
    transaction: { chainId: profile.chainId, to: input.nft as Hex, data, value: "0" },
  };
}
