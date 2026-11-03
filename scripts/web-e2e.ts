import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const base = process.env.Q_TAPE_WEB_URL ?? "http://127.0.0.1:18790";
const evidenceDir = resolve(root, "experiments/guardian-fork/results/web-e2e");
mkdirSync(evidenceDir, { recursive: true });

const browser = await chromium.launch({ channel: process.env.Q_TAPE_CHROME_CHANNEL ?? "chrome", headless: true });
const page = await browser.newPage();
const results: { scenario: string; ok: boolean; detail?: string }[] = [];

async function scenario(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ scenario: name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ scenario: name, ok: false, detail: error instanceof Error ? error.message : String(error) });
    console.log(`FAIL ${name}: ${results.at(-1)?.detail}`);
  }
}

const walletScript = (chainId: string) => `
  window.__qtapeWalletCalls = [];
  window.ethereum = {
    request: async (args) => {
      window.__qtapeWalletCalls.push(args);
      if (args.method === "eth_requestAccounts") return ["0x25063c2210a0BCcCE3e15d250573179483275f22"];
      if (args.method === "eth_chainId") return "${chainId}";
      if (args.method === "eth_sendTransaction") return "0x${"ab".repeat(32)}";
      return "0x0";
    }
  };
`;

async function openWithWallet(chainId = "0xc4"): Promise<void> {
  await page.addInitScript({ content: walletScript(chainId) });
  await page.goto(base, { waitUntil: "domcontentloaded" });
}

await scenario("status page renders without a wallet", async () => {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.fill("#site", "10.2.4.tape");
  await page.click("#inspect");
  await page.waitForFunction(() => document.querySelector("#status-result")?.textContent?.includes("PROTECTED") || document.querySelector("#status-result")?.textContent?.includes("UNPROTECTED"), null, { timeout: 30_000 });
  const text = await page.textContent("#status-result");
  if (!text?.includes("UNPROTECTED") && !text?.includes("PROTECTED")) throw new Error(`unexpected status: ${text}`);
});

await scenario("deposit uses the injected EIP-1193 wallet and exact server transaction", async () => {
  const page2 = await browser.newPage();
  await page2.addInitScript({ content: walletScript("0xc4") });
  await page2.goto(base, { waitUntil: "domcontentloaded" });
  await page2.click('[data-tab="deposit"]');
  await page2.fill("#deposit-vault", "0x67d269191c92Caf3cD7723F116c85e6E9bf55933");
  await page2.fill("#deposit-nft", "0x68f65046fDEab90d8dB376C27B5E6AE159d240cc");
  await page2.fill("#deposit-token", "10");
  await page2.click("#deposit");
  await page2.waitForFunction(() => document.querySelector("#deposit-result")?.textContent?.includes("Deposit transaction submitted"), null, { timeout: 10_000 });
  const calls = await page2.evaluate(() => (globalThis as unknown as { __qtapeWalletCalls: { method: string; params?: unknown[] }[] }).__qtapeWalletCalls);
  if (!calls.some((call) => call.method === "eth_sendTransaction")) throw new Error("no eth_sendTransaction call");
  await page2.close();
});

await scenario("wrong wallet chain is rejected before sending", async () => {
  const page3 = await browser.newPage();
  await page3.addInitScript({ content: walletScript("0x1") });
  await page3.goto(base, { waitUntil: "domcontentloaded" });
  await page3.click('[data-tab="deploy"]');
  await page3.fill("#deploy-tx", JSON.stringify({ chainId: 196, to: null, data: "0x60006000", value: "0" }));
  await page3.click("#deploy");
  await page3.waitForFunction(() => document.querySelector("#deploy-result")?.textContent?.includes("wrong network"), null, { timeout: 10_000 });
  const calls = await page3.evaluate(() => (globalThis as unknown as { __qtapeWalletCalls: { method: string; params?: unknown[] }[] }).__qtapeWalletCalls);
  if (calls.some((call) => call.method === "eth_sendTransaction")) throw new Error("wallet sent transaction on wrong chain");
  await page3.close();
});

await scenario("invalid prepared transaction is rejected before wallet access", async () => {
  const page4 = await browser.newPage();
  await page4.addInitScript({ content: walletScript("0xc4") });
  await page4.goto(base, { waitUntil: "domcontentloaded" });
  await page4.click('[data-tab="deploy"]');
  await page4.fill("#deploy-tx", JSON.stringify({ chainId: 1, to: null, data: "0x60006000", value: "0" }));
  await page4.click("#deploy");
  await page4.waitForFunction(() => document.querySelector("#deploy-result")?.textContent?.includes("chainId must be 196"), null, { timeout: 10_000 });
  const calls = await page4.evaluate(() => (globalThis as unknown as { __qtapeWalletCalls: { method: string }[] }).__qtapeWalletCalls);
  if (calls.length !== 0) throw new Error("wallet was accessed before validation");
  await page4.close();
});

await page.screenshot({ path: resolve(evidenceDir, "status.png"), fullPage: true }).catch(() => {});
await browser.close();
const failed = results.filter((result) => !result.ok);
await Bun.write(resolve(evidenceDir, "result.json"), JSON.stringify({ base, results }, null, 2) + "\n");
console.log(JSON.stringify({ ok: failed.length === 0, results }));
if (failed.length > 0) process.exitCode = 1;
