import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, writeFile } from "node:fs/promises";
import {
  DEFAULT_RELEASE_LIMITS,
  buildDepositPlan,
  buildRenewalCall,
  readRenewalQuote,
  createProvider,
  encodeExecuteData,
  getProfile,
  inspectSite,
  planRelease,
  prepareVault,
  readVaultState,
  simulateSignedRequest,
  submitSignedRequest,
  totalCallValue,
  verifyRelease,
  encodeRequest,
} from "@qtape/client";
import { buildRotateKeyCall } from "@qtape/protocol";
import {
  bytesToHex,
  createRequestV1,
  parseSignedRequestV1,
  type Hex,
  type SignedRequestV1,
} from "@qtape/schema";
import { createKeyProof, createKeyBundle, readKeyBundle, signDigest, verifyBackup } from "@qtape/signer";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { boolFlag, flagString, requireFlag, rpcUrls, UsageError, type ParsedArgs } from "./args.js";
import { loadGuardianArtifact } from "./artifact.js";
import { collectSiteFiles } from "./files.js";
import { readNewPassphrase, readPassphrase } from "./passphrase.js";
import { printJson } from "./output.js";

export interface CommandResult {
  command: string;
  data: unknown;
}

const COMMANDS: Record<string, string[]> = {
  inspect: ["inspect"],
  "key create": ["key", "create"],
  "key verify-backup": ["key", "verify-backup"],
  "vault prepare": ["vault", "prepare"],
  "vault deposit": ["vault", "deposit"],
  "vault renew": ["vault", "renew"],
  "release plan": ["release", "plan"],
  "release verify": ["release", "verify"],
  "request sign": ["request", "sign"],
  "request submit": ["request", "submit"],
  "operator revoke": ["operator", "revoke"],
  "key rotate": ["key", "rotate"],
  "vault exit": ["vault", "exit"],
};

export async function runCommand(args: ParsedArgs): Promise<CommandResult> {
  const [first, second] = args.positional;
  const twoWords = `${first ?? ""} ${second ?? ""}`.trim();
  const command = twoWords in COMMANDS ? twoWords : first ?? "";
  if (!(command in COMMANDS)) throw new UsageError(`unknown command: ${command || "(none)"}; run qtape --help`);
  const consumed = command.includes(" ") ? 2 : 1;
  const rest = args.positional.slice(consumed);
  switch (command) {
    case "inspect":
      return { command, data: await commandInspect(args, rest) };
    case "key create":
      return { command, data: await commandKeyCreate(args) };
    case "key verify-backup":
      return { command, data: await commandKeyVerifyBackup(args) };
    case "vault prepare":
      return { command, data: await commandVaultPrepare(args) };
    case "vault deposit":
      return { command, data: await commandVaultDeposit(args) };
    case "vault renew":
      return { command, data: await commandVaultRenew(args) };
    case "release plan":
      return { command, data: await commandReleasePlan(args, rest) };
    case "release verify":
      return { command, data: await commandReleaseVerify(args, rest) };
    case "request sign":
      return { command, data: await commandRequestSign(args, rest) };
    case "request submit":
      return { command, data: await commandRequestSubmit(args, rest) };
    case "operator revoke":
      return { command, data: await commandOperatorRevoke(args) };
    case "key rotate":
      return { command, data: await commandKeyRotate(args) };
    case "vault exit":
      return { command, data: await commandVaultExit(args) };
    default:
      throw new UsageError("unreachable");
  }
}

async function commandInspect(args: ParsedArgs, rest: string[]) {
  const site = rest[0];
  if (!site) throw new UsageError("usage: qtape inspect <site>");
  return await inspectSite({
    site,
    profile: flagString(args, "profile"),
    rpcUrls: rpcUrls(args),
    blockNumber: flagString(args, "block"),
  });
}

async function commandKeyCreate(args: ParsedArgs) {
  const out = requireFlag(args, "out");
  if (existsSync(out) && !boolFlag(args, "force")) throw new UsageError(`${out} already exists; pass --force to overwrite`);
  const passphrase = await readNewPassphrase();
  const created = await createKeyBundle(passphrase);
  await Bun.write(out, created.fileBytes);
  await chmod(out, 0o600);
  return {
    file: out,
    algorithm: created.bundle.algorithm,
    publicKey: created.bundle.publicKey,
    fingerprint: created.publicKeyFingerprint,
    createdAt: created.bundle.createdAt,
  };
}

async function commandKeyVerifyBackup(args: ParsedArgs) {
  const path = requireFlag(args, "key");
  const passphrase = await readPassphrase("Backup passphrase: ");
  const result = await verifyBackup({
    path,
    passphrase,
    challenge: flagString(args, "challenge") as Hex | undefined,
  });
  return result;
}

async function commandVaultPrepare(args: ParsedArgs) {
  const profile = getProfile(flagString(args, "profile"));
  const name = requireFlag(args, "name");
  const deployer = requireFlag(args, "deployer") as Hex;
  const bundlePath = requireFlag(args, "key");
  const passphrase = await readPassphrase("Backup passphrase: ");
  const bundle = await readKeyBundle(bundlePath, passphrase);
  const rpc = rpcUrls(args)?.[0] ?? profile.runtimeRpcUrls[0]!;
  const provider = createProvider(rpc, profile.chainId);
  const verifierAddress = requireFlag(args, "verifier") as Hex;
  const verifierCode = await provider.client.getCode({ address: verifierAddress });
  const { keccak256 } = await import("viem");
  if (!verifierCode || verifierCode === "0x" || keccak256(verifierCode) !== profile.verifierCodeHash) {
    throw new UsageError("CONFIG_CHANGED: verifier code hash does not match the fixed profile");
  }
  const nonce = flagString(args, "deployer-nonce")
    ?? (await provider.client.getTransactionCount({ address: deployer, blockTag: "pending" })).toString();
  const predicted = await import("viem").then(({ getContractAddress }) => getContractAddress({ from: deployer, nonce: BigInt(nonce) }));
  const challenge = randomBytes32();
  const proof = await createKeyProof({ bundle, chainId: profile.chainId.toString(), vault: predicted, challenge });
  const prepared = prepareVault({
    profile: profile.id,
    deployer,
    deployerNonce: nonce,
    name,
    verifier: verifierAddress,
    nft: requireFlag(args, "nft") as Hex,
    tokenId: requireFlag(args, "token-id"),
    container: requireFlag(args, "container") as Hex,
    publicKey: bundle.publicKey,
    keyChallenge: challenge,
    keyProof: proof.signature,
    artifact: loadGuardianArtifact(flagString(args, "artifact")),
  });
  if (prepared.predictedAddress.toLowerCase() !== predicted.toLowerCase()) throw new Error("predicted address mismatch");
  return {
    predictedAddress: prepared.predictedAddress,
    chainId: prepared.transaction.chainId,
    transaction: prepared.transaction,
    keyChallenge: challenge,
    keyProof: proof.signature,
    keyProofDigest: proof.digest,
    publicKey: bundle.publicKey,
    fingerprint: proof.fingerprint,
    deployerNonce: nonce,
  };
}

async function commandVaultDeposit(args: ParsedArgs) {
  const keyPath = requireFlag(args, "key");
  const passphrase = await readPassphrase("Backup passphrase: ");
  await verifyBackup({ path: keyPath, passphrase });
  const plan = buildDepositPlan({
    profile: flagString(args, "profile"),
    vault: requireFlag(args, "vault"),
    nft: requireFlag(args, "nft"),
    tokenId: requireFlag(args, "token-id"),
    from: requireFlag(args, "from"),
  });
  return plan;
}

async function commandVaultRenew(args: ParsedArgs) {
  const profile = getProfile(flagString(args, "profile"));
  const rpc = rpcUrls(args)?.[0] ?? profile.runtimeRpcUrls[0]!;
  const vault = requireFlag(args, "vault") as Hex;
  const name = requireFlag(args, "name");
  const months = flagString(args, "months") ?? "1";
  const state = await readVaultState({ vault, profile: profile.id, rpcUrls: [rpc] });
  const provider = createProvider(rpc, profile.chainId);
  const block = await provider.client.getBlock({ blockTag: "latest" });
  const quote = await readRenewalQuote({
    provider,
    binding: profile.domainBinding,
    name,
    container: state.container,
    months,
    blockNumber: block.number,
  });
  const call = buildRenewalCall({
    binding: profile.domainBinding,
    name,
    container: state.container,
    months: quote.months,
    total: quote.total,
  });
  const bundle = await readKey(args, "key");
  const expiry = flagString(args, "expiry") ?? (block.timestamp + 300n).toString();
  const nonce = flagString(args, "nonce") ?? state.nonce;
  const request = createRequestV1({
    chainId: profile.chainId.toString(),
    guardian: vault,
    operation: 0,
    calls: [call],
    nonce,
    expiry,
  });
  const { digest } = encodeRequest(request);
  return await finishSigned(args, { request, digest, signature: await signDigest({ digest, bundle }) }, {
    operation: "EXECUTE (renew)",
    quote,
    digest,
  });
}

async function commandReleasePlan(args: ParsedArgs, rest: string[]) {
  const directory = rest[0];
  if (!directory) throw new UsageError("usage: qtape release plan <dir> --site <name> --vault <address>");
  const files = collectSiteFiles(directory);
  const plan = await planRelease({
    site: requireFlag(args, "site"),
    vault: requireFlag(args, "vault"),
    files,
    profile: flagString(args, "profile"),
    rpcUrls: rpcUrls(args),
    fallbackPath: flagString(args, "fallback"),
    prune: !boolFlag(args, "no-prune"),
    baseBlock: flagString(args, "block"),
  });
  const out = flagString(args, "out");
  if (out) await Bun.write(out, JSON.stringify(plan, null, 2) + "\n");
  return {
    planPath: out ?? null,
    site: plan.site,
    baseBlock: plan.baseBlock,
    manifestSha256: plan.manifestSha256,
    diff: plan.diff,
    fileCount: plan.files.length,
    callCount: plan.calls.length,
    batchCount: plan.batches.length,
    batches: plan.batches.map((batch) => ({ index: batch.index, calls: batch.calls.length, estimatedGas: batch.estimatedGas })),
    limits: plan.limits,
    warnings: plan.warnings,
  };
}

async function commandRequestSign(args: ParsedArgs, rest: string[]) {
  const planPath = rest[0];
  if (!planPath) throw new UsageError("usage: qtape request sign <plan.json> --key <bundle.age>");
  const plan = JSON.parse(await Bun.file(planPath).text()) as Awaited<ReturnType<typeof planRelease>>;
  const batchIndex = Number(flagString(args, "batch") ?? "0");
  const batch = plan.batches[batchIndex];
  if (!batch) throw new UsageError(`plan has no batch ${batchIndex}`);
  const bundlePath = requireFlag(args, "key");
  const passphrase = await readPassphrase("Backup passphrase: ");
  const bundle = await readKeyBundle(bundlePath, passphrase);
  const request = createRequestV1({
    chainId: plan.chainId.toString(),
    guardian: plan.vault,
    operation: 0,
    calls: batch.calls,
    nonce: (BigInt(plan.nonce) + BigInt(batchIndex)).toString(),
    expiry: plan.expiry,
  });
  const { digest } = encodeRequest(request);
  const signature = await signDigest({ digest, bundle });
  const signed: SignedRequestV1 = { request, signature, digest };
  return await finishSigned(args, signed, {
    planPath,
    batch: batchIndex,
    operation: "EXECUTE",
    calls: batch.calls.length,
    digest,
    summary: plan.diff,
  });
}

async function commandRequestSubmit(args: ParsedArgs, rest: string[]) {
  const path = rest[0];
  if (!path) throw new UsageError("usage: qtape request submit <signed.json> [--relayer URL]");
  const signed = parseSignedRequestV1(JSON.parse(await Bun.file(path).text()));
  if (flagString(args, "relayer")) {
    const submission = await submitSignedRequest({ signedRequest: signed }, { type: "relayer", url: requireFlag(args, "relayer") });
    return submission;
  }
  const walletAddress = flagString(args, "wallet-address");
  const walletKeyFile = flagString(args, "wallet-key-file");
  const profile = getProfile(flagString(args, "profile"));
  const rpc = rpcUrls(args)?.[0] ?? profile.runtimeRpcUrls[0]!;
  if (!walletAddress && !walletKeyFile) {
    const simulation = await simulateSignedRequest({
      signedRequest: signed,
      rpcUrl: rpc,
      chainId: profile.chainId,
      from: flagString(args, "simulate-from") as Hex | undefined,
      gasBudget: flagString(args, "gas-budget") ?? DEFAULT_RELEASE_LIMITS.gasBudget,
    });
    if (!simulation.withinBudget) throw new Error(`BUDGET_EXCEEDED: estimated ${simulation.gasEstimate} > ${simulation.gasBudget}`);
    return {
      unsignedTransaction: {
        chainId: Number(signed.request.chainId),
        to: signed.request.guardian,
        data: encodeExecuteData(signed),
        value: totalCallValue(signed).toString(),
      },
      simulation,
      note: "submit this transaction with any wallet, or pass --relayer, --wallet-address (unlocked local node) or --wallet-key-file (local test only)",
    };
  }
  const localAccount = walletKeyFile ? privateKeyToAccount((await Bun.file(walletKeyFile).text()).trim() as Hex) : null;
  const accountAddress = walletAddress ? (walletAddress as Hex) : localAccount!.address;
  const simulation = await simulateSignedRequest({
    signedRequest: signed,
    rpcUrl: rpc,
    chainId: profile.chainId,
    from: accountAddress,
    gasBudget: flagString(args, "gas-budget") ?? DEFAULT_RELEASE_LIMITS.gasBudget,
  });
  if (!simulation.withinBudget) throw new Error(`BUDGET_EXCEEDED: estimated ${simulation.gasEstimate} > ${simulation.gasBudget}`);
  const chain = {
    id: profile.chainId,
    name: `qtape-${profile.chainId}`,
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  };
  const wallet = createWalletClient({ account: localAccount ?? accountAddress, chain, transport: http(rpc) });
  return await submitSignedRequest({ signedRequest: signed }, {
    type: "wallet",
    sendTransaction: async (transaction) => {
      return await wallet.sendTransaction({
        account: localAccount ?? accountAddress,
        chain,
        to: transaction.to,
        data: transaction.data,
        value: BigInt(transaction.value),
        gas: (BigInt(simulation.gasEstimate) * 110n) / 100n,
      });
    },
    waitForReceipt: async (hash) => {
      const receipt = await providerWait(rpc, profile.chainId, hash);
      return { status: receipt.status, blockNumber: receipt.blockNumber };
    },
  });
}

async function commandReleaseVerify(args: ParsedArgs, rest: string[]) {
  const planPath = rest[0];
  if (!planPath) throw new UsageError("usage: qtape release verify <plan.json> --rpc <url> --rpc <url>");
  const plan = JSON.parse(await Bun.file(planPath).text()) as Awaited<ReturnType<typeof planRelease>>;
  const urls = rpcUrls(args) ?? getProfile(plan.profile).runtimeRpcUrls;
  return await verifyRelease({ plan, rpcUrls: urls, blockNumber: flagString(args, "block") });
}

async function commandOperatorRevoke(args: ParsedArgs) {
  const profile = getProfile(flagString(args, "profile"));
  const rpc = rpcUrls(args)?.[0] ?? profile.runtimeRpcUrls[0]!;
  const vault = requireFlag(args, "vault") as Hex;
  const state = await readVaultState({ vault, profile: profile.id, rpcUrls: [rpc] });
  const bundle = await readKey(args, "key");
  const expiry = flagString(args, "expiry") ?? (await defaultExpiry(rpc, profile.chainId));
  const nonce = flagString(args, "nonce") ?? state.nonce;
  const { encodeFunctionData } = await import("viem");
  const { registryAbi } = await import("@qtape/client");
  const calls = [{
    target: profile.siteRegistry,
    value: "0",
    data: encodeFunctionData({
      abi: registryAbi,
      functionName: "setOperator",
      args: [state.container, requireFlag(args, "operator") as Hex, 0n],
    }),
  }];
  const request = createRequestV1({ chainId: profile.chainId.toString(), guardian: vault, operation: 0, calls, nonce, expiry });
  const { digest } = encodeRequest(request);
  return await finishSigned(args, { request, digest, signature: await signDigest({ digest, bundle }) }, {
    operation: "EXECUTE (revoke operator)",
    digest,
  });
}

async function commandKeyRotate(args: ParsedArgs) {
  const profile = getProfile(flagString(args, "profile"));
  const rpc = rpcUrls(args)?.[0] ?? profile.runtimeRpcUrls[0]!;
  const vault = requireFlag(args, "vault") as Hex;
  const state = await readVaultState({ vault, profile: profile.id, rpcUrls: [rpc] });
  const oldBundle = await readKey(args, "key");
  const newBundle = await readKey(args, "new-key");
  const challenge = randomBytes32();
  const proof = await createKeyProof({ bundle: newBundle, chainId: profile.chainId.toString(), vault, challenge });
  const rotateCall = buildRotateKeyCall({ vault, newKey: newBundle.publicKey, challenge, proof: proof.signature });
  const expiry = flagString(args, "expiry") ?? (await defaultExpiry(rpc, profile.chainId));
  const nonce = flagString(args, "nonce") ?? state.nonce;
  const request = createRequestV1({ chainId: profile.chainId.toString(), guardian: vault, operation: 2, calls: [rotateCall], nonce, expiry });
  const { digest } = encodeRequest(request);
  return await finishSigned(args, { request, digest, signature: await signDigest({ digest, bundle: oldBundle }) }, {
    operation: "ROTATE_KEY",
    digest,
    newKeyFingerprint: proof.fingerprint,
    keyProofDigest: proof.digest,
  });
}

async function commandVaultExit(args: ParsedArgs) {
  const profile = getProfile(flagString(args, "profile"));
  const rpc = rpcUrls(args)?.[0] ?? profile.runtimeRpcUrls[0]!;
  const vault = requireFlag(args, "vault") as Hex;
  const state = await readVaultState({ vault, profile: profile.id, rpcUrls: [rpc] });
  const bundle = await readKey(args, "key");
  const to = requireFlag(args, "to") as Hex;
  const { encodeFunctionData } = await import("viem");
  const { nftAbi } = await import("@qtape/client");
  const expiry = flagString(args, "expiry") ?? (await defaultExpiry(rpc, profile.chainId));
  const nonce = flagString(args, "nonce") ?? state.nonce;
  const call = {
    target: state.nft,
    value: "0",
    data: encodeFunctionData({ abi: nftAbi, functionName: "safeTransferFrom", args: [vault, to, BigInt(state.tokenId)] }),
  };
  const request = createRequestV1({ chainId: profile.chainId.toString(), guardian: vault, operation: 1, calls: [call], nonce, expiry });
  const { digest } = encodeRequest(request);
  return await finishSigned(args, { request, digest, signature: await signDigest({ digest, bundle }) }, {
    operation: "EXIT",
    digest,
  });
}

async function finishSigned(
  args: ParsedArgs,
  signed: SignedRequestV1,
  metadata: Record<string, unknown>,
) {
  const out = flagString(args, "out");
  if (out) await writeFile(out, JSON.stringify(signed, null, 2) + "\n");
  return { ...metadata, signedRequest: signed, signedPath: out ?? null };
}

async function readKey(args: ParsedArgs, flagName: string) {
  const path = requireFlag(args, flagName);
  const passphrase = await readPassphrase("Backup passphrase: ");
  return await readKeyBundle(path, passphrase);
}

async function defaultExpiry(rpc: string, chainId: number): Promise<string> {
  const latest = await createProvider(rpc, chainId).client.getBlock({ blockTag: "latest" });
  return (latest.timestamp + 300n).toString();
}

async function providerWait(rpc: string, chainId: number, hash: Hex): Promise<{ status: "success" | "reverted"; blockNumber: string }> {
  const provider = createProvider(rpc, chainId);
  for (let attempt = 0; attempt < 120; attempt++) {
    const receipt = await provider.client.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) return { status: receipt.status === "success" ? "success" : "reverted", blockNumber: receipt.blockNumber.toString() };
    await Bun.sleep(250);
  }
  throw new Error("BROADCAST_UNKNOWN: transaction receipt not observed");
}

export function randomBytes32(): Hex {
  return bytesToHex(randomBytes(32));
}

export function helpText(): string {
  return `qtape <command> [options]

  inspect <site> [--profile xlayer-196] [--rpc URL]... [--block N] [--json]
  key create --out <bundle.age> [--force] [--json]
  key verify-backup --key <bundle.age> [--challenge 0x..] [--json]
  key rotate --vault 0x.. --key <old.age> --new-key <new.age> [--nonce N] [--expiry N] [--out signed.json]
  vault prepare --name <site> --verifier 0x.. --nft 0x.. --token-id N --container 0x.. --deployer 0x.. --key <bundle.age> [--artifact path] [--rpc URL]
  vault deposit --vault 0x.. --nft 0x.. --token-id N --from 0x.. --key <bundle.age> [--json]
  vault renew --vault 0x.. --name <site> --months N --key <bundle.age> [--out signed.json]
  vault exit --vault 0x.. --to 0x.. --key <bundle.age> [--out signed.json]
  operator revoke --vault 0x.. --operator 0x.. --key <bundle.age> [--out signed.json]
  release plan <dir> --site <name> --vault 0x.. [--fallback path] [--out plan.json] [--no-prune] [--rpc URL]...
  release verify <plan.json> [--block N] [--rpc URL]... [--json]
  request sign <plan.json> --key <bundle.age> [--batch N] [--out signed.json]
  request submit <signed.json> [--relayer URL | --wallet-address 0x.. | --wallet-key-file <file>] [--rpc URL] [--json]

Falcon backup passphrases are read from the terminal (or stdin when piped); they are never accepted as flags or environment variables.`;
}
