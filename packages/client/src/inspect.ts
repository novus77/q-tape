import { keccak256, type Hex } from "viem";
import { bindingAbi, containerAbi, factoryAbi, guardianAbi, nftAbi, openerAbi, registryAbi } from "./abi.js";
import { QtapeClientError, clientError } from "./errors.js";
import { parseTapeName } from "./name.js";
import { getProfile } from "./profiles.js";
import { resolvePinnedBlock, createProviders, readImplementationSlot, type ProviderContext, type PinnedBlock } from "./rpc.js";
import type { SiteInspection, VaultState } from "./types.js";

export interface InspectSiteInput {
  site: string;
  profile?: string;
  rpcUrls?: string[];
  blockNumber?: string | bigint;
}

interface SiteSnapshot {
  site: string;
  processor: Hex;
  processorNumber: number;
  tokenId: string;
  container: Hex;
  holder: Hex;
  opened: boolean;
  live: boolean;
  paidUntil: string | null;
  vault: VaultState | null;
  implementations: { siteRegistry: Hex; domainBinding: Hex };
  warnings: string[];
}

export async function inspectSite(input: InspectSiteInput): Promise<SiteInspection> {
  const profile = getProfile(input.profile);
  const parsed = parseTapeName(input.site);
  if (parsed.areaCode !== profile.areaCode) {
    clientError("CHAIN_MISMATCH", `name ${parsed.onChainName} belongs to area code ${parsed.areaCode ?? "bnb"}, profile ${profile.id}`);
  }
  const providers = createProviders(input.rpcUrls ?? profile.runtimeRpcUrls, profile.chainId);
  const pinned = await resolvePinnedBlock(providers, input.blockNumber, profile.maxPinLag);
  const snapshots = await Promise.all(providers.map((provider) => readSnapshot(provider, profile.id, parsed, pinned)));
  assertSnapshotsAgree(snapshots, providers);

  const snapshot = snapshots[0];
  if (!snapshot) clientError("RPC_UNAVAILABLE", "no provider snapshot");
  return {
    site: snapshot.site,
    chainId: profile.chainId,
    blockNumber: pinned.number.toString(),
    blockHash: pinned.hash,
    profile: profile.id,
    processor: snapshot.processor,
    processorNumber: snapshot.processorNumber,
    tokenId: snapshot.tokenId,
    container: snapshot.container,
    holder: snapshot.holder,
    opened: snapshot.opened,
    live: snapshot.live,
    paidUntil: snapshot.paidUntil,
    protection: computeProtection(snapshot),
    vault: snapshot.vault,
    implementations: snapshot.implementations,
    warnings: snapshot.warnings,
  };
}

async function readSnapshot(
  provider: ProviderContext,
  profileId: string,
  parsed: ReturnType<typeof parseTapeName>,
  pinned: PinnedBlock,
): Promise<SiteSnapshot> {
  const profile = getProfile(profileId);
  const blockNumber = pinned.number;
  const warnings: string[] = [];

  const siteRegistryImplementation = await readImplementationSlot(provider, profile.siteRegistry, blockNumber);
  if (!profile.acceptedSiteStoreImplementations.map(lower).includes(siteRegistryImplementation)) {
    clientError("CONFIG_CHANGED", `SiteRegistry implementation ${siteRegistryImplementation} is not accepted`);
  }
  const domainBindingImplementation = await readImplementationSlot(provider, profile.domainBinding, blockNumber);
  if (!profile.acceptedDomainBindingImplementations.map(lower).includes(domainBindingImplementation)) {
    clientError("CONFIG_CHANGED", `DomainBinding implementation ${domainBindingImplementation} is not accepted`);
  }

  let processor: Hex;
  try {
    processor = await provider.client.readContract({
      address: profile.factory,
      abi: factoryAbi,
      functionName: "cpuAt",
      args: [BigInt(parsed.processorNumber)],
      blockNumber,
    });
  } catch {
    clientError("NO_SUCH_CPU", `processor ${parsed.processorNumber} does not exist`);
  }
  const processorCode = await provider.client.getCode({ address: processor, blockNumber });
  if (!processorCode || processorCode === "0x") clientError("NOT_TAPEOUT", "processor has no code");
  if (keccak256(processorCode) !== profile.processorCodeHash) {
    clientError("CONFIG_CHANGED", `processor code hash ${keccak256(processorCode)} is not accepted`);
  }

  const tokenId = BigInt(parsed.tokenId);
  const container = await provider.client.readContract({
    address: profile.opener,
    abi: openerAbi,
    functionName: "accountOf",
    args: [processor, tokenId],
    blockNumber,
  });
  if (container === "0x0000000000000000000000000000000000000000") clientError("NOT_TAPEOUT", "resolved container is zero");

  const opened = await provider.client.readContract({
    address: profile.opener,
    abi: openerAbi,
    functionName: "isOpened",
    args: [processor, tokenId],
    blockNumber,
  });

  let holder: Hex;
  try {
    holder = await provider.client.readContract({
      address: processor,
      abi: nftAbi,
      functionName: "ownerOf",
      args: [tokenId],
      blockNumber,
    });
  } catch {
    clientError("NO_SUCH_TOKEN", `processor ${processor} has no token ${tokenId}`);
  }

  const containerToken = await provider.client.readContract({
    address: container,
    abi: containerAbi,
    functionName: "token",
    args: [],
    blockNumber,
  });
  if (
    BigInt(containerToken[0]) !== BigInt(profile.chainId)
    || lower(containerToken[1]) !== lower(processor)
    || BigInt(containerToken[2]) !== tokenId
  ) {
    clientError("NOT_TAPEOUT", "container token() does not match resolved identity");
  }
  const containerOwner = await provider.client.readContract({
    address: container,
    abi: containerAbi,
    functionName: "owner",
    args: [],
    blockNumber,
  });
  if (lower(containerOwner) !== lower(holder)) {
    clientError("NOT_TAPEOUT", "container owner is not the NFT holder");
  }

  const live = await provider.client.readContract({
    address: profile.domainBinding,
    abi: bindingAbi,
    functionName: "isLive",
    args: [parsed.onChainName, container],
    blockNumber,
  });
  let containerLive = false;
  try {
    containerLive = await provider.client.readContract({
      address: profile.domainBinding,
      abi: bindingAbi,
      functionName: "isContainerLive",
      args: [container],
      blockNumber,
    });
  } catch {
    warnings.push("DomainBinding.isContainerLive unavailable; treated as false");
  }
  const paidUntilRaw = await provider.client.readContract({
    address: profile.domainBinding,
    abi: bindingAbi,
    functionName: "containerPaidUntil",
    args: [container],
    blockNumber,
  });
  if (!opened) warnings.push("container is not opened");
  if (!live && !containerLive) warnings.push("site name is not currently paid");

  const vault = await readVaultIfAny(provider, holder, blockNumber, profile.id, processor, tokenId, container);
  if (vault && vault.publicKey === "0x") warnings.push("vault has no registered Falcon public key");

  return {
    site: parsed.onChainName,
    processor,
    processorNumber: parsed.processorNumber,
    tokenId: tokenId.toString(),
    container,
    holder,
    opened,
    live: live || containerLive,
    paidUntil: BigInt(paidUntilRaw) === 0n ? null : paidUntilRaw.toString(),
    vault,
    implementations: {
      siteRegistry: siteRegistryImplementation,
      domainBinding: domainBindingImplementation,
    },
    warnings,
  };
}

async function readVaultIfAny(
  provider: ProviderContext,
  holder: Hex,
  blockNumber: bigint,
  profileId: string,
  processor: Hex,
  tokenId: bigint,
  container: Hex,
): Promise<VaultState | null> {
  const profile = getProfile(profileId);
  const code = await provider.client.getCode({ address: holder, blockNumber });
  if (!code || code === "0x") return null;
  try {
    const [verifier, nft, vaultTokenId, vaultContainer, registry, binding, nameHash, publicKey, fingerprint, nonce] = await Promise.all([
      provider.client.readContract({ address: holder, abi: guardianAbi, functionName: "verifier", blockNumber }),
      provider.client.readContract({ address: holder, abi: guardianAbi, functionName: "nft", blockNumber }),
      provider.client.readContract({ address: holder, abi: guardianAbi, functionName: "tokenId", blockNumber }),
      provider.client.readContract({ address: holder, abi: guardianAbi, functionName: "container", blockNumber }),
      provider.client.readContract({ address: holder, abi: guardianAbi, functionName: "registry", blockNumber }),
      provider.client.readContract({ address: holder, abi: guardianAbi, functionName: "binding", blockNumber }),
      provider.client.readContract({ address: holder, abi: guardianAbi, functionName: "canonicalNameHash", blockNumber }),
      provider.client.readContract({ address: holder, abi: guardianAbi, functionName: "publicKey", blockNumber }),
      provider.client.readContract({ address: holder, abi: guardianAbi, functionName: "keyFingerprint", blockNumber }),
      provider.client.readContract({ address: holder, abi: guardianAbi, functionName: "nonce", blockNumber }),
    ]);
    const expectedFingerprint = publicKey === "0x" ? null : keccak256(publicKey);
    const verifierCode = await provider.client.getCode({ address: verifier, blockNumber });
    if (!verifierCode || verifierCode === "0x" || keccak256(verifierCode) !== profile.verifierCodeHash) {
      return null;
    }
    if (
      lower(nft) !== lower(processor)
      || vaultTokenId !== tokenId
      || lower(vaultContainer) !== lower(container)
      || lower(registry) !== lower(profile.siteRegistry)
      || lower(binding) !== lower(profile.domainBinding)
      || (expectedFingerprint !== null && lower(fingerprint) !== lower(expectedFingerprint))
    ) {
      return null;
    }
    return {
      address: holder,
      verifier,
      nft,
      tokenId: vaultTokenId.toString(),
      container: vaultContainer,
      registry,
      binding,
      canonicalNameHash: nameHash,
      publicKey,
      keyFingerprint: fingerprint,
      nonce: nonce.toString(),
      holder,
      deployed: true,
    };
  } catch {
    return null;
  }
}

function computeProtection(snapshot: SiteSnapshot): SiteInspection["protection"] {
  if (!snapshot.vault) {
    return snapshot.holder === "0x0000000000000000000000000000000000000000" ? "EXITED" : "UNPROTECTED";
  }
  if (snapshot.vault.publicKey === "0x") return "DEPOSITED_UNVERIFIED";
  return "PROTECTED";
}

function assertSnapshotsAgree(snapshots: SiteSnapshot[], providers: ProviderContext[]): void {
  const first = snapshots[0];
  if (!first) clientError("RPC_UNAVAILABLE", "no snapshots");
  for (let index = 1; index < snapshots.length; index++) {
    const other = snapshots[index];
    if (!other) continue;
    const fields: (keyof SiteSnapshot)[] = ["processor", "container", "holder", "opened", "live", "paidUntil"];
    for (const field of fields) {
      if (JSON.stringify(first[field]) !== JSON.stringify(other[field])) {
        throw new QtapeClientError(
          "RPC_DISAGREEMENT",
          `providers ${providers[0]?.url} and ${providers[index]?.url} disagree on ${field}`,
        );
      }
    }
  }
}

function lower(value: string): string {
  return value.toLowerCase();
}
