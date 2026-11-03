import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, getContractAddress, http, keccak256, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_RELEASE_LIMITS,
  buildDepositPlan,
  createProvider,
  buildRenewalCall,
  encodeExecuteData,
  getProfile,
  inspectSite,
  planRelease,
  readRenewalQuote,
  readVaultState,
  registerProfile,
  simulateSignedRequest,
  submitSignedRequest,
  totalCallValue,
  verifyRelease,
  type ChainProfile,
} from "../packages/client/src/index.ts";
import { buildRotateKeyCall, encodeRequest } from "../packages/protocol/src/index.ts";
import { createRequestV1, type Hex as SchemaHex, type SignedRequestV1 } from "../packages/schema/src/index.ts";
import { createKeyBundle, createKeyProof, signDigest } from "../packages/signer/src/index.ts";

const ROOT = resolve(import.meta.dir, "..");
const ENDPOINT = "http://127.0.0.1:18548";
const PROXY_PORT = 18549;
const OUT_DIR = resolve(ROOT, "experiments/guardian-fork/results/m3-fixture");
const PASS = "m3-fixture-local-passphrase";
const NEW_PASS = "m3-fixture-new-passphrase";

const chain = defineChain({ id: 196, name: "qtape-fixture", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, rpcUrls: { default: { http: [ENDPOINT] } } });
const publicClient = createPublicClient({ chain, transport: http(ENDPOINT) });
const proxy = Bun.serve({
  port: PROXY_PORT,
  async fetch(request) {
    const body = await request.arrayBuffer();
    return await fetch(ENDPOINT, { method: request.method, headers: request.headers, body: body.byteLength > 0 ? body : undefined });
  },
});
const records: unknown[] = [];
function record(step: string, data: unknown): void {
  records.push({ step, data });
  console.log(step, JSON.stringify(data));
}

function readArtifact(path: string): { abi: readonly unknown[]; bytecode: Hex } {
  const parsed = JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
  return { abi: parsed.abi, bytecode: parsed.bytecode.object };
}
function artifact(name: string): { abi: readonly unknown[]; bytecode: Hex } {
  return readArtifact(`contracts/out/FixtureProtocol.sol/${name}.json`);
}
function guardianArtifact(): { abi: readonly unknown[]; bytecode: Hex } {
  return readArtifact("contracts/out/Guardian.sol/Guardian.json");
}
function verifierArtifact(): { abi: readonly unknown[]; bytecode: Hex } {
  return readArtifact("contracts/out/FNDSAVerifier.sol/FNDSAVerifier.json");
}

async function waitReceipt(hash: Hex) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) {
      if (receipt.status !== "success") throw new Error(`transaction reverted: ${hash}`);
      return receipt;
    }
    await Bun.sleep(100);
  }
  throw new Error(`receipt not found: ${hash}`);
}

try {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const accounts = (await publicClient.request({ method: "eth_accounts" })) as Hex[];
  const deployer = accounts[0];
  if (!deployer) throw new Error("no Anvil account");
  const wallet = createWalletClient({ chain, account: deployer, transport: http(ENDPOINT) });
  const deployerNonce = await publicClient.getTransactionCount({ address: deployer });
  if (deployerNonce !== 0) throw new Error("fixture drill expects a fresh Anvil account nonce 0");

  const deploy = async (name: string, args: readonly unknown[] = []) => {
    const art = artifact(name);
    const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args: [...args], gas: 20_000_000n });
    const receipt = await waitReceipt(hash);
    if (!receipt.contractAddress) throw new Error(`${name} has no address`);
    return receipt.contractAddress;
  };

  const nft = await deploy("FixtureNFT");
  const container = await deploy("FixtureContainer", [nft, 10n, 196n]);
  const registry = await deploy("FixtureRegistry");
  const binding = await deploy("FixtureBinding");
  const factory = await deploy("FixtureFactory", [nft]);
  const opener = await deploy("FixtureOpener", [container]);
  const implementation = await deploy("FixtureImplementation");
  const verifierArtifactData = verifierArtifact();
  const verifierHash = await wallet.deployContract({ abi: verifierArtifactData.abi, bytecode: verifierArtifactData.bytecode, args: [], gas: 20_000_000n });
  const verifierReceipt = await waitReceipt(verifierHash);
  if (!verifierReceipt.contractAddress) throw new Error("verifier has no address");
  const verifier = verifierReceipt.contractAddress;

  const nftAbi = artifact("FixtureNFT").abi;
  const mintHash = await wallet.writeContract({ address: nft, abi: nftAbi, functionName: "mint", args: [deployer, 10n], gas: 500_000n });
  await waitReceipt(mintHash);

  const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implementationWord = ("0x" + "00".repeat(12) + implementation.slice(2)) as Hex;
  for (const proxyAddress of [registry, binding]) {
    await publicClient.request({ method: "anvil_setStorageAt", params: [proxyAddress, implementationSlot, implementationWord] });
  }

  const [nftCode, registryCode, verifierCode] = await Promise.all([
    publicClient.getCode({ address: nft }),
    publicClient.getCode({ address: registry }),
    publicClient.getCode({ address: verifier }),
  ]);
  if (!nftCode || !registryCode || !verifierCode) throw new Error("fixture deployment missing code");

  const profile: ChainProfile = {
    id: "fixture-local",
    chainId: 196,
    areaCode: 2,
    finalityTag: "safe",
    maxPinLag: 300,
    factory,
    opener,
    erc6551Registry: "0x0000000000000000000000000000000000000000",
    containerImplementation: container,
    siteRegistry: registry,
    acceptedSiteStoreImplementations: [implementation],
    domainBinding: binding,
    acceptedDomainBindingImplementations: [implementation],
    processorCodeHash: keccak256(nftCode),
    proxyCodeHash: keccak256(registryCode),
    verifierCodeHash: keccak256(verifierCode),
    runtimeRpcUrls: [ENDPOINT, `http://127.0.0.1:${PROXY_PORT}`],
  };
  registerProfile(profile);
  record("fixture-deployed", { nft, container, registry, binding, factory, opener, verifier, implementation });

  const oldKeyPath = resolve(OUT_DIR, "old.age");
  const newKeyPath = resolve(OUT_DIR, "new.age");
  const oldBundle = await createKeyBundle(PASS, { scryptWorkFactor: 4 });
  const newBundle = await createKeyBundle(NEW_PASS, { scryptWorkFactor: 4 });
  await Bun.write(oldKeyPath, oldBundle.fileBytes);
  await Bun.write(newKeyPath, newBundle.fileBytes);
  chmodSync(oldKeyPath, 0o600);
  chmodSync(newKeyPath, 0o600);

  const predicted = getContractAddress({ from: deployer, nonce: await publicClient.getTransactionCount({ address: deployer }) });
  const challenge = "0x" + "11".repeat(32) as SchemaHex;
  const keyProof = await createKeyProof({ bundle: oldBundle.bundle, chainId: "196", vault: predicted, challenge });
  const name = "10.2.0.tape";
  const nameHash = keccak256(stringToHex(name));
  const guardianArt = guardianArtifact();
  const deployGuardianHash = await wallet.deployContract({
    abi: guardianArt.abi,
    bytecode: guardianArt.bytecode,
    args: [verifier, nft, 10n, container, registry, binding, nameHash, oldBundle.bundle.publicKey, challenge, keyProof.signature],
    gas: 20_000_000n,
  });
  const guardianReceipt = await waitReceipt(deployGuardianHash);
  if (!guardianReceipt.contractAddress) throw new Error("Guardian has no address");
  const vault = guardianReceipt.contractAddress;
  if (vault.toLowerCase() !== predicted.toLowerCase()) throw new Error(`predicted ${predicted} != ${vault}`);
  record("guardian-deployed", { vault, predicted });

  const providers = [ENDPOINT, `http://127.0.0.1:${PROXY_PORT}`];
  const beforeDeposit = await inspectSite({ site: name, profile: "fixture-local", rpcUrls: providers });
  record("inspect-before-deposit", { protection: beforeDeposit.protection, holder: beforeDeposit.holder });
  if (beforeDeposit.protection !== "UNPROTECTED") throw new Error(`unexpected before-deposit state ${beforeDeposit.protection}`);

  const deposit = buildDepositPlan({ profile: "fixture-local", vault, nft, tokenId: "10", from: deployer });
  const depositTx = await wallet.sendTransaction({ to: deposit.transaction.to, data: deposit.transaction.data, gas: 500_000n });
  await waitReceipt(depositTx);
  const afterDeposit = await inspectSite({ site: name, profile: "fixture-local", rpcUrls: providers });
  record("inspect-after-deposit", { protection: afterDeposit.protection, vault: afterDeposit.vault?.address });
  if (afterDeposit.protection !== "PROTECTED") throw new Error(`expected PROTECTED, got ${afterDeposit.protection}`);

  const siteFiles = [
    { path: "index.html", content: new TextEncoder().encode("<h1>m3 fixture</h1>") },
    { path: "assets/app.js", content: new TextEncoder().encode("console.log('m3')") },
  ];
  const plan = await planRelease({ site: name, vault, files: siteFiles, profile: "fixture-local", rpcUrls: providers, prune: false });
  record("plan", { batches: plan.batches.length, manifest: plan.manifestSha256, diff: plan.diff });
  let lastBlock = "0";
  for (let batchIndex = 0; batchIndex < plan.batches.length; batchIndex++) {
    const batch = plan.batches[batchIndex]!;
    const request = createRequestV1({
      chainId: "196",
      guardian: vault,
      operation: 0,
      calls: batch.calls,
      nonce: (BigInt(plan.nonce) + BigInt(batchIndex)).toString(),
      expiry: plan.expiry,
    });
    const { digest } = encodeRequest(request);
    const signature = await signDigest({ digest, bundle: oldBundle.bundle });
    const signed: SignedRequestV1 = { request, signature, digest };
    const simulation = await simulateSignedRequest({ signedRequest: signed, rpcUrl: ENDPOINT, chainId: 196, from: deployer, gasBudget: DEFAULT_RELEASE_LIMITS.gasBudget });
    if (!simulation.withinBudget) throw new Error(`batch ${batchIndex} over gas budget`);
    const tx = await wallet.sendTransaction({ to: vault, data: encodeExecuteData(signed), value: totalCallValue(signed), gas: (BigInt(simulation.gasEstimate) * 110n) / 100n });
    const receipt = await waitReceipt(tx);
    lastBlock = receipt.blockNumber.toString();
    record(`publish-batch-${batchIndex}`, { transactionHash: tx, blockNumber: lastBlock });
  }
  const verification = await verifyRelease({ plan, rpcUrls: providers, blockNumber: lastBlock });
  if (verification.status !== "VERIFIED") throw new Error(`verification failed: ${JSON.stringify(verification)}`);
  record("release-verified", { blockNumber: verification.blockNumber, files: verification.files.map((file) => ({ path: file.path, ok: file.ok })) });

  const feeHash = await wallet.writeContract({ address: binding, abi: artifact("FixtureBinding").abi, functionName: "setMonthlyFee", args: [1_000_000_000_000_000_000n], gas: 100_000n });
  await waitReceipt(feeHash);
  const quoteProvider = createProvider(ENDPOINT, 196);
  const quote = await readRenewalQuote({ provider: quoteProvider, binding, name, container, months: "1", blockNumber: await publicClient.getBlockNumber() });
  record("renewal-quote", quote);
  const renewCall = buildRenewalCall({ binding, name, container, months: quote.months, total: quote.total });
  const renewRequest = createRequestV1({ chainId: "196", guardian: vault, operation: 0, calls: [renewCall], nonce: (BigInt(plan.nonce) + BigInt(plan.batches.length)).toString(), expiry: plan.expiry });
  const renewEncoded = encodeRequest(renewRequest);
  const renewSigned: SignedRequestV1 = { request: renewRequest, signature: await signDigest({ digest: renewEncoded.digest, bundle: oldBundle.bundle }), digest: renewEncoded.digest };
  const renewTx = await wallet.sendTransaction({ to: vault, data: encodeExecuteData(renewSigned), value: BigInt(quote.total), gas: 4_000_000n });
  await waitReceipt(renewTx);
  record("renewed", { transactionHash: renewTx, quote });

  const rotateChallenge = "0x" + "22".repeat(32) as SchemaHex;
  const rotateProof = await createKeyProof({ bundle: newBundle.bundle, chainId: "196", vault, challenge: rotateChallenge });
  const rotateCall = buildRotateKeyCall({ vault, newKey: newBundle.bundle.publicKey, challenge: rotateChallenge, proof: rotateProof.signature });
  const rotateRequest = createRequestV1({ chainId: "196", guardian: vault, operation: 2, calls: [rotateCall], nonce: (BigInt(plan.nonce) + BigInt(plan.batches.length) + 1n).toString(), expiry: plan.expiry });
  const rotateEncoded = encodeRequest(rotateRequest);
  const rotateSigned: SignedRequestV1 = { request: rotateRequest, signature: await signDigest({ digest: rotateEncoded.digest, bundle: oldBundle.bundle }), digest: rotateEncoded.digest };
  const rotateTx = await wallet.sendTransaction({ to: vault, data: encodeExecuteData(rotateSigned), value: 0n, gas: 20_000_000n });
  await waitReceipt(rotateTx);
  const rotatedState = await readVaultState({ vault, profile: "fixture-local", rpcUrls: [ENDPOINT] });
  if (rotatedState.keyFingerprint.toLowerCase() !== newBundle.publicKeyFingerprint.toLowerCase()) throw new Error("rotation fingerprint mismatch");
  record("key-rotated", { transactionHash: rotateTx, fingerprint: rotatedState.keyFingerprint });

  const recipient = "0x000000000000000000000000000000000000bEEF" as Hex;
  const exitCall = { target: nft as Hex, value: "0", data: encodeFunctionData({ abi: artifact("FixtureNFT").abi, functionName: "safeTransferFrom", args: [vault, recipient, 10n] }) };
  const exitRequest = createRequestV1({ chainId: "196", guardian: vault, operation: 1, calls: [exitCall], nonce: (BigInt(plan.nonce) + BigInt(plan.batches.length) + 2n).toString(), expiry: plan.expiry });
  const exitEncoded = encodeRequest(exitRequest);
  const exitSigned: SignedRequestV1 = { request: exitRequest, signature: await signDigest({ digest: exitEncoded.digest, bundle: newBundle.bundle }), digest: exitEncoded.digest };
  const exitTx = await wallet.sendTransaction({ to: vault, data: encodeExecuteData(exitSigned), value: 0n, gas: 8_000_000n });
  await waitReceipt(exitTx);
  const owner = await publicClient.readContract({ address: nft, abi: artifact("FixtureNFT").abi, functionName: "ownerOf", args: [10n] });
  if (owner.toLowerCase() !== recipient.toLowerCase()) throw new Error("exit recipient mismatch");
  record("exited", { owner, transactionHash: exitTx });

  await Bun.write(resolve(OUT_DIR, "profile.json"), JSON.stringify(profile, null, 2) + "\n");
  await Bun.write(resolve(OUT_DIR, "result.json"), JSON.stringify({ ok: true, fixtureOnly: true, publicChainTransactionsBroadcast: 0, profile, vault, records }, null, 2) + "\n");
  console.log("M3_FIXTURE_E2E_OK", JSON.stringify({ vault, batches: plan.batches.length, lastBlock }));
} finally {
  proxy.stop(true);
}
