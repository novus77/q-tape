#!/usr/bin/env bun
/**
 * M3 read-only preflight. Never deploys, signs, or broadcasts.
 *
 * Checks a fixed deployment profile, optional site, optional Vault and optional
 * deployer before a pilot rehearsal:
 *   bun scripts/m3-preflight.ts --profile xlayer-196 --site 10.2.4.tape \
 *     --rpc URL_A --rpc URL_B [--vault 0x..] [--deployer 0x..]
 *   bun scripts/m3-preflight.ts --profile-file ./fixture-profile.json ...
 */
import { readFileSync } from "node:fs";
import {
  createProvider,
  createProviders,
  getProfile,
  inspectSite,
  readImplementationSlot,
  readVaultState,
  registerProfile,
  resolvePinnedBlock,
  type ChainProfile,
} from "../packages/client/src/index.ts";

const args = process.argv.slice(2);
function flag(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1];
}
function rpcUrls(): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--rpc" && args[index + 1]) values.push(args[index + 1]!);
  }
  return values;
}

const profileFile = flag("profile-file");
let profileId = flag("profile");
if (profileFile) {
  const loaded = JSON.parse(readFileSync(profileFile, "utf8")) as ChainProfile;
  registerProfile(loaded);
  profileId = loaded.id;
}
const profile = getProfile(profileId);
const urls = rpcUrls().length > 0 ? rpcUrls() : profile.runtimeRpcUrls;
const site = flag("site");
const vault = flag("vault");
const deployer = flag("deployer");
const maxLag = BigInt(flag("max-lag", "300") ?? "300");
const checks: Record<string, boolean> = {};
const errors: string[] = [];
const warnings: string[] = [];

try {
  const providers = createProviders(urls, profile.chainId);
  const pinned = await resolvePinnedBlock(providers, flag("block"), profile.maxPinLag);
  checks.chainAndBlock = true;

  for (const provider of providers.slice(0, 1)) {
    const registryImplementation = await readImplementationSlot(provider, profile.siteRegistry, pinned.number);
    const bindingImplementation = await readImplementationSlot(provider, profile.domainBinding, pinned.number);
    checks.siteRegistryImplementation = profile.acceptedSiteStoreImplementations.map((value) => value.toLowerCase()).includes(registryImplementation);
    checks.domainBindingImplementation = profile.acceptedDomainBindingImplementations.map((value) => value.toLowerCase()).includes(bindingImplementation);
    if (!checks.siteRegistryImplementation) errors.push(`SiteRegistry implementation ${registryImplementation} is not accepted`);
    if (!checks.domainBindingImplementation) errors.push(`DomainBinding implementation ${bindingImplementation} is not accepted`);
  }

  let inspection = null;
  if (site) {
    inspection = await inspectSite({ site, profile: profile.id, rpcUrls: urls, blockNumber: pinned.number });
    checks.site = true;
    if (!inspection.opened) warnings.push("site container is not opened");
    if (!inspection.live) warnings.push("site activation is not currently paid");
    if (inspection.protection === "CONFIG_CHANGED" || inspection.protection === "UNSUPPORTED") {
      errors.push(`site protection state is ${inspection.protection}`);
    }
  }

  if (vault) {
    const state = await readVaultState({ vault, profile: profile.id, rpcUrls: urls, blockNumber: pinned.number });
    checks.vaultCode = state.deployed;
    checks.vaultRegistry = state.registry.toLowerCase() === profile.siteRegistry.toLowerCase();
    checks.vaultBinding = state.binding.toLowerCase() === profile.domainBinding.toLowerCase();
    checks.vaultVerifier = state.verifier.toLowerCase() !== "0x0000000000000000000000000000000000000000";
    if (!checks.vaultRegistry || !checks.vaultBinding || !checks.vaultVerifier) errors.push("Vault fixed parameters do not match the selected profile");
    if (state.holder.toLowerCase() !== vault.toLowerCase()) warnings.push("Vault no longer holds the bound NFT (EXITED or transferred)");
  }

  if (deployer) {
    const provider = createProvider(urls[0]!, profile.chainId);
    const balance = await provider.client.getBalance({ address: deployer as `0x${string}` });
    const nonce = await provider.client.getTransactionCount({ address: deployer as `0x${string}` });
    checks.deployer = true;
    console.log(`deployer ${deployer}: balance=${balance.toString()} wei nonce=${nonce}`);
  }

  const ok = errors.length === 0 && Object.values(checks).every(Boolean);
  const result = {
    ok,
    profile: profile.id,
    chainId: profile.chainId,
    blockNumber: pinned.number.toString(),
    blockHash: pinned.hash,
    checks,
    errors,
    warnings,
    inspection,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!ok || errors.length > 0 || warnings.some((warning) => warning.includes("no longer"))) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ ok: false, profile: profile.id, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}

export {};
