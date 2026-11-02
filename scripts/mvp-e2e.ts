import { createWalletClient, createPublicClient, defineChain, http, bytesToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mkdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const ENDPOINT = "http://127.0.0.1:18545";
const PROXY_PORT = 18547;
const OUT_DIR = resolve(ROOT, "experiments/guardian-fork/results/mvp-e2e");
const SITE_DIR = resolve(OUT_DIR, "site");
const M2 = process.env.Q_TAPE_M2 === "1";
const PASS="e2e-passphrase-2026";
const NEW_PASS="e2e-new-passphrase-2026";
const NFT = "0x68f65046fDEab90d8dB376C27B5E6AE159d240cc" as Hex;
const CONTAINER = "0xC0B4900262d0bC13F2C67C0Fc4CF92c04E0aB814" as Hex;
const RECIPIENT = "0x000000000000000000000000000000000000bEEF" as Hex;

const chain = defineChain({ id: 196, name: "qtape-local", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, rpcUrls: { default: { http: [ENDPOINT] } } });
const publicClient = createPublicClient({ chain, transport: http(ENDPOINT) });
const accounts = (await publicClient.request({ method: "eth_accounts" })) as Hex[];
const deployer = accounts[0];
if (!deployer) throw new Error("Anvil returned no accounts");
const wallet = createWalletClient({ chain, account: deployer, transport: http(ENDPOINT) });
const relayerPrivateKey = bytesToHex(randomBytes(32)) as Hex;
const relayerAccount = privateKeyToAccount(relayerPrivateKey);
await publicClient.request({ method: "anvil_setBalance", params: [relayerAccount.address, "0x56bc75e2d63100000"] });
const proxy = Bun.serve({
  port: PROXY_PORT,
  async fetch(request) {
    const body = await request.arrayBuffer();
    return await fetch(ENDPOINT, { method: request.method, headers: request.headers, body: body.byteLength > 0 ? body : undefined });
  },
});

const log: unknown[] = [];
let relayerProcess: ReturnType<typeof Bun.spawn> | null = null;
function record(step: string, data: unknown): void {
  log.push({ step, data });
  console.log(step, JSON.stringify(data));
}

async function waitReceipt(hash: Hex) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) return receipt;
    await Bun.sleep(100);
  }
  throw new Error(`receipt not found for ${hash}`);
}

async function runCli(args: string[], stdin?: string): Promise<{ out: string; err: string; code: number; json: any }> {
  const child = Bun.spawn(["bun", resolve(ROOT, "packages/cli/src/main.ts"), ...args], {
    cwd: ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin !== undefined) {
    child.stdin.write(stdin);
    child.stdin.end();
  } else {
    child.stdin.end();
  }
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const trimmed = out.trim();
  let json: any = null;
  if (trimmed.startsWith("{")) json = JSON.parse(trimmed);
  return { out, err, code, json };
}

function requireOk(result: Awaited<ReturnType<typeof runCli>>, step: string): any {
  if (result.code !== 0) throw new Error(`${step} failed: exit ${result.code}\n${result.err}\n${result.out}`);
  if (!result.json?.ok) throw new Error(`${step} did not return ok JSON: ${result.out}`);
  return result.json.data;
}

try {
  rmSync(OUT_DIR, { recursive: true, force: true });
  if (M2) {
    const viteBuild = Bun.spawnSync(["bun", "run", "build:vite-fixture"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    if (viteBuild.exitCode !== 0) {
      throw new Error(`vite build failed: ${new TextDecoder().decode(viteBuild.stderr)}`);
    }
    const { collectViteDist } = await import("../packages/adapter-vite/src/index.ts");
    const viteFiles = collectViteDist(resolve(ROOT, "examples/vite-site/dist"));
    for (const file of viteFiles) {
      const target = join(SITE_DIR, file.path);
      mkdirSync(dirname(target), { recursive: true });
      await Bun.write(target, file.content);
    }
    record("vite-build-and-adapter-collected", { files: viteFiles.map((file) => file.path) });
  } else {
    mkdirSync(resolve(SITE_DIR, "assets"), { recursive: true });
    writeFileSync(resolve(SITE_DIR, "index.html"), "<!doctype html><title>Q-Tape e2e</title><h1>independent release</h1>\n");
    writeFileSync(resolve(SITE_DIR, "assets/app.js"), "console.log('q-tape independent release');\n");
    writeFileSync(resolve(SITE_DIR, "assets/style.css"), "body { color: #123; }\n");
  }
  const walletKeyPath = resolve(OUT_DIR, "relayer-gas.key");
  writeFileSync(walletKeyPath, relayerPrivateKey + "\n", { mode: 0o600 });
  chmodSync(walletKeyPath, 0o600);

  const chainId = await publicClient.getChainId();
  if (chainId !== 196) throw new Error(`wrong chain ${chainId}`);
  const blockNumber = await publicClient.getBlockNumber();
  if (blockNumber !== 74818827n) throw new Error("requires the untouched X Layer fork at block 74818827");

  const keyOld = resolve(OUT_DIR, "old.age");
  const keyNew = resolve(OUT_DIR, "new.age");
  const created = requireOk(await runCli(["key", "create", "--out", keyOld, "--json"], `${PASS}\n${PASS}\n`), "key create");
  record("key-create", { fingerprint: created.fingerprint, algorithm: created.algorithm });
  const createdNew = requireOk(await runCli(["key", "create", "--out", keyNew, "--json"], `${NEW_PASS}\n${NEW_PASS}\n`), "key create new");
  record("key-create-new", { fingerprint: createdNew.fingerprint });

  const failedBackup = await runCli(["key", "verify-backup", "--key", keyOld, "--json"], "wrong-passphrase\n");
  if (failedBackup.code === 0) throw new Error("wrong backup passphrase unexpectedly succeeded");
  if (failedBackup.out.includes(PASS)) throw new Error("passphrase leaked to stdout");
  record("backup-recovery-failure-blocks", { exitCode: failedBackup.code, code: failedBackup.json?.error?.code });
  const backupOk = requireOk(await runCli(["key", "verify-backup", "--key", keyOld, "--json"], `${PASS}\n`), "key verify-backup");
  record("backup-recovery-ok", { fingerprint: backupOk.fingerprint, verified: backupOk.verified });

  const verifierArtifact = await Bun.file(resolve(ROOT, "contracts/out/FNDSAVerifier.sol/FNDSAVerifier.json")).json();
  const verifierTx = await wallet.deployContract({ abi: verifierArtifact.abi, bytecode: verifierArtifact.bytecode.object, args: [], gas: 20_000_000n });
  const verifierReceipt = await waitReceipt(verifierTx);
  if (!verifierReceipt.contractAddress) throw new Error("verifier deployment has no address");
  record("deploy-verifier", { address: verifierReceipt.contractAddress });

  const prepared = requireOk(await runCli([
    "vault", "prepare",
    "--name", "10.2.4.tape",
    "--verifier", verifierReceipt.contractAddress,
    "--nft", NFT,
    "--token-id", "10",
    "--container", CONTAINER,
    "--deployer", deployer,
    "--key", keyOld,
    "--artifact", resolve(ROOT, "contracts/out/Guardian.sol/Guardian.json"),
    "--rpc", ENDPOINT,
    "--json",
  ], `${PASS}\n`), "vault prepare");
  record("vault-prepare", { predictedAddress: prepared.predictedAddress, chainId: prepared.transaction.chainId, value: prepared.transaction.value });

  const deployTx = await wallet.sendTransaction({ data: prepared.transaction.data, gas: 20_000_000n });
  const deployReceipt = await waitReceipt(deployTx);
  if (!deployReceipt.contractAddress) throw new Error("guardian deployment has no address");
  if (deployReceipt.contractAddress.toLowerCase() !== prepared.predictedAddress.toLowerCase()) {
    throw new Error(`deployed ${deployReceipt.contractAddress} != predicted ${prepared.predictedAddress}`);
  }
  const vault = deployReceipt.contractAddress;
  record("deploy-guardian", { vault, blockNumber: deployReceipt.blockNumber.toString() });

  const relayerPort = 18787;
  const relayerDb = resolve(OUT_DIR, "relayer.sqlite");
  const relayer = Bun.spawn(["bun", resolve(ROOT, "apps/relayer/src/server.ts")], {
    cwd: ROOT,
    env: {
      ...process.env,
      Q_TAPE_RELAYER_RPC_URL: ENDPOINT,
      Q_TAPE_RELAYER_PRIVATE_KEY_FILE: walletKeyPath,
      Q_TAPE_RELAYER_ALLOWED_GUARDIANS: vault,
      Q_TAPE_RELAYER_MAX_GAS: "8000000",
      Q_TAPE_RELAYER_MAX_VALUE: "0",
      Q_TAPE_RELAYER_PORT: String(relayerPort),
      Q_TAPE_RELAYER_DB_PATH: relayerDb,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  relayerProcess = relayer;
  let relayerReady = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${relayerPort}/health`);
      if (response.ok) { relayerReady = true; break; }
    } catch {}
    await Bun.sleep(100);
  }
  if (!relayerReady) throw new Error("relayer did not become healthy");
  record("relayer-healthy", { port: relayerPort });

  const metricsResponse = await fetch(`http://127.0.0.1:${relayerPort}/metrics`);
  if (!metricsResponse.ok) throw new Error(`relayer metrics HTTP ${metricsResponse.status}`);
  const metrics = await metricsResponse.json() as { ok: boolean; requests: { total: number; byStatus: Record<string, number> } };
  if (!metrics.ok) throw new Error("relayer metrics not ok");
  record("relayer-metrics", metrics.requests);

  const monitor = Bun.spawnSync([
    "bun", resolve(ROOT, "scripts/monitor.ts"),
    "--relayer", `http://127.0.0.1:${relayerPort}`,
    "--rpc", ENDPOINT,
    "--chain-id", "196",
    "--max-lag", "300",
  ], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  if (monitor.exitCode !== 0) throw new Error(`monitor probe failed: ${new TextDecoder().decode(monitor.stderr)}`);
  record("monitor-probe", JSON.parse(new TextDecoder().decode(monitor.stdout)));

  const deployHead = deployReceipt.blockNumber.toString();
  const beforeDeposit = requireOk(await runCli(["inspect", "10.2.4.tape", "--rpc", ENDPOINT, "--rpc", `http://127.0.0.1:${PROXY_PORT}`, "--block", deployHead, "--json"]), "inspect before deposit");
  record("inspect-before-deposit", { protection: beforeDeposit.protection, holder: beforeDeposit.holder });

  const blockedDeposit = await runCli(["vault", "deposit", "--vault", vault, "--nft", NFT, "--token-id", "10", "--from", beforeDeposit.holder, "--key", keyOld, "--json"], "wrong-passphrase\n");
  if (blockedDeposit.code === 0) throw new Error("vault deposit did not block a failed backup drill");
  record("deposit-blocked-by-backup-failure", { exitCode: blockedDeposit.code, code: blockedDeposit.json?.error?.code });
  const deposit = requireOk(await runCli(["vault", "deposit", "--vault", vault, "--nft", NFT, "--token-id", "10", "--from", beforeDeposit.holder, "--key", keyOld, "--json"], `${PASS}\n`), "vault deposit");
  await publicClient.request({ method: "anvil_impersonateAccount", params: [beforeDeposit.holder] });
  await publicClient.request({ method: "anvil_setBalance", params: [beforeDeposit.holder, "0x56bc75e2d63100000"] });
  const ownerWallet = createWalletClient({ chain, account: beforeDeposit.holder, transport: http(ENDPOINT) });
  const depositTx = await ownerWallet.sendTransaction({ to: deposit.transaction.to, data: deposit.transaction.data, gas: 500_000n });
  const depositReceipt = await waitReceipt(depositTx);
  await publicClient.request({ method: "anvil_stopImpersonatingAccount", params: [beforeDeposit.holder] });
  const depositBlock = depositReceipt.blockNumber.toString();
  const afterDeposit = requireOk(await runCli(["inspect", "10.2.4.tape", "--rpc", ENDPOINT, "--rpc", `http://127.0.0.1:${PROXY_PORT}`, "--block", depositBlock, "--json"]), "inspect after deposit");
  if (afterDeposit.protection !== "PROTECTED") throw new Error(`expected PROTECTED after deposit, got ${afterDeposit.protection}`);
  record("deposit-and-protected", { vault: afterDeposit.vault.address, nonce: afterDeposit.vault.nonce });

  const planPath = resolve(OUT_DIR, "plan.json");
  const planSummary = requireOk(await runCli([
    "release", "plan", SITE_DIR,
    "--site", "10.2.4.tape",
    "--vault", vault,
    "--rpc", ENDPOINT,
    "--rpc", `http://127.0.0.1:${PROXY_PORT}`,
    "--block", depositBlock,
    "--out", planPath,
    "--no-prune",
    "--json",
  ]), "release plan");
  record("release-plan", { diff: planSummary.diff, batches: planSummary.batches, manifest: planSummary.manifestSha256 });

  const plan = await Bun.file(planPath).json();
  let lastBlock = "0";
  for (let batchIndex = 0; batchIndex < plan.batches.length; batchIndex++) {
    const signedPath = resolve(OUT_DIR, `signed-${batchIndex}.json`);
    requireOk(await runCli(["request", "sign", planPath, "--batch", String(batchIndex), "--key", keyOld, "--out", signedPath, "--json"], `${PASS}\n`), `request sign ${batchIndex}`);
    const submission = requireOk(await runCli(["request", "submit", signedPath, "--wallet-address", deployer, "--rpc", ENDPOINT, "--json"]), `request submit ${batchIndex}`);
    if (submission.status !== "confirmed") throw new Error(`batch ${batchIndex} not confirmed: ${JSON.stringify(submission)}`);
    lastBlock = submission.blockNumber;
    record(`release-batch-${batchIndex}`, { transactionHash: submission.transactionHash, blockNumber: submission.blockNumber });
  }

  const verification = requireOk(await runCli([
    "release", "verify", planPath,
    "--rpc", ENDPOINT,
    "--rpc", `http://127.0.0.1:${PROXY_PORT}`,
    "--block", lastBlock,
    "--json",
  ]), "release verify");
  if (verification.status !== "VERIFIED") throw new Error(`release verification failed: ${JSON.stringify(verification)}`);
  record("release-verified", { blockNumber: verification.blockNumber, files: verification.files.map((file: { path: string; ok: boolean }) => ({ path: file.path, ok: file.ok })) });

  if (M2) {
    const renewPath = resolve(OUT_DIR, "renew.json");
    const renewMetadata = requireOk(await runCli([
      "vault", "renew",
      "--vault", vault,
      "--name", "10.2.4.tape",
      "--months", "1",
      "--key", keyOld,
      "--rpc", ENDPOINT,
      "--out", renewPath,
      "--json",
    ], `${PASS}\n`), "vault renew");
    const renewSubmission = requireOk(await runCli(["request", "submit", renewPath, "--wallet-address", deployer, "--rpc", ENDPOINT, "--json"]), "vault renew submit");
    if (renewSubmission.status !== "confirmed") throw new Error(`vault renew not confirmed: ${JSON.stringify(renewSubmission)}`);
    record("vault-renewed", { quote: renewMetadata.quote, transactionHash: renewSubmission.transactionHash });
  }

  const revokePath = resolve(OUT_DIR, "revoke.json");
  requireOk(await runCli([
    "operator", "revoke",
    "--vault", vault,
    "--operator", "0x000000000000000000000000000000000000A110",
    "--key", keyOld,
    "--rpc", ENDPOINT,
    "--out", revokePath,
    "--json",
  ], `${PASS}\n`), "operator revoke");
  const revokeSubmission = requireOk(await runCli(["request", "submit", revokePath, "--wallet-address", deployer, "--rpc", ENDPOINT, "--json"]), "operator revoke submit");
  if (revokeSubmission.status !== "confirmed") throw new Error(`operator revoke not confirmed: ${JSON.stringify(revokeSubmission)}`);
  record("operator-revoked", { transactionHash: revokeSubmission.transactionHash });

  const rotatePath = resolve(OUT_DIR, "rotate.json");
  const rotateCommand = requireOk(await runCli([
    "key", "rotate",
    "--vault", vault,
    "--key", keyOld,
    "--new-key", keyNew,
    "--rpc", ENDPOINT,
    "--out", rotatePath,
    "--json",
  ], `${PASS}\n${NEW_PASS}\n`), "key rotate");
  const rotateSummary = JSON.parse(await Bun.file(rotatePath).text()) as { digest: string };
  const rotateSubmission = requireOk(await runCli(["request", "submit", rotatePath, "--relayer", `http://127.0.0.1:${relayerPort}`, "--json"]), "key rotate submit via relayer");
  if (rotateSubmission.status !== "submitted") throw new Error(`relayer did not accept rotation: ${JSON.stringify(rotateSubmission)}`);
  let rotateRecord: { status?: string; transactionHash?: string } = {};
  for (let attempt = 0; attempt < 200; attempt++) {
    const response = await fetch(`http://127.0.0.1:${relayerPort}/v1/requests/${rotateSummary.digest}`);
    rotateRecord = await response.json();
    if (rotateRecord.status === "confirmed" || rotateRecord.status === "reverted") break;
    await Bun.sleep(100);
  }
  if (rotateRecord.status !== "confirmed") throw new Error(`relayer rotation not confirmed: ${JSON.stringify(rotateRecord)}`);
  const rotatedVault = await import("../packages/client/src/vault.ts").then(({ readVaultState }) => readVaultState({ vault, rpcUrls: [ENDPOINT] }));
  if (rotatedVault.keyFingerprint.toLowerCase() !== rotateCommand.newKeyFingerprint.toLowerCase()) {
    throw new Error(`rotation fingerprint mismatch: ${rotatedVault.keyFingerprint}`);
  }
  record("key-rotated", { transactionHash: rotateRecord.transactionHash, newFingerprint: rotateCommand.newKeyFingerprint });

  const exitPath = resolve(OUT_DIR, "exit.json");
  requireOk(await runCli([
    "vault", "exit",
    "--vault", vault,
    "--to", RECIPIENT,
    "--key", keyNew,
    "--rpc", ENDPOINT,
    "--out", exitPath,
    "--json",
  ], `${NEW_PASS}\n`), "vault exit");
  const exitSubmission = requireOk(await runCli(["request", "submit", exitPath, "--wallet-address", deployer, "--rpc", ENDPOINT, "--json"]), "vault exit submit");
  if (exitSubmission.status !== "confirmed") throw new Error("exit not confirmed");
  const ownerAfterExit = await publicClient.readContract({ address: NFT, abi: [{ name: "ownerOf", type: "function", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }] }], functionName: "ownerOf", args: [10n] });
  if (ownerAfterExit.toLowerCase() !== RECIPIENT.toLowerCase()) throw new Error(`exit recipient mismatch: ${ownerAfterExit}`);
  record("vault-exited", { owner: ownerAfterExit, transactionHash: exitSubmission.transactionHash });

  const result = { ok: true, localOnly: true, publicChainTransactionsBroadcast: 0, vault, releaseBatches: plan.batches.length, lastBlock, log };
  await Bun.write(resolve(OUT_DIR, "e2e-result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log("MVP_E2E_OK", JSON.stringify({ vault, releaseBatches: plan.batches.length, lastBlock }));
} finally {
  proxy.stop(true);
  if (relayerProcess) relayerProcess.kill();
}
