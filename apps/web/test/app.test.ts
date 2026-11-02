import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { SiteInspection } from "@qtape/client";
import { createApp, mountApp, type EthereumProvider } from "../src/app.js";

const site: SiteInspection = {
  site: "10.2.4.tape",
  chainId: 196,
  blockNumber: "74818827",
  blockHash: "0xb8433ae3f968b1e3326113a94a549577c836d45556320e861ec6667a9a3742c2",
  profile: "xlayer-196",
  processor: "0x68f65046fDEab90d8dB376C27B5E6AE159d240cc",
  processorNumber: 4,
  tokenId: "10",
  container: "0xC0B4900262d0bC13F2C67C0Fc4CF92c04E0aB814",
  holder: "0x67d269191c92Caf3cD7723F116c85e6E9bf55933",
  opened: true,
  live: true,
  paidUntil: "1795513090",
  protection: "PROTECTED",
  vault: {
    address: "0x67d269191c92Caf3cD7723F116c85e6E9bf55933",
    verifier: "0xc5a5C42992dECbae36851359345FE25997F5C42d",
    nft: "0x68f65046fDEab90d8dB376C27B5E6AE159d240cc",
    tokenId: "10",
    container: "0xC0B4900262d0bC13F2C67C0Fc4CF92c04E0aB814",
    registry: "0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6",
    binding: "0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9",
    canonicalNameHash: `0x${"11".repeat(32)}`,
    publicKey: "0x0901",
    keyFingerprint: `0x${"22".repeat(32)}`,
    nonce: "0",
    holder: "0x67d269191c92Caf3cD7723F116c85e6E9bf55933",
    deployed: true,
  },
  implementations: {
    siteRegistry: "0xa85c4143d1d4a77f54b8e4ecc9e6d1418afea45f",
    domainBinding: "0x5ebf29b80789e548907c707530c3c7607c4347df",
  },
  warnings: ["fixture warning"],
};

function dom(): { doc: Document; window: Window } {
  const window = new Window({ url: "http://localhost" });
  window.document.body.innerHTML = `
    <button data-tab="status" aria-selected="true">status</button>
    <button data-tab="deploy" aria-selected="false">deploy</button>
    <main>
      <section id="tab-status" class="active"><input id="site" /><input id="block" /><button id="inspect">inspect</button><div id="status-result"></div></section>
      <section id="tab-deploy"><textarea id="deploy-tx"></textarea><button id="deploy">deploy</button><div id="deploy-result"></div></section>
      <section id="tab-deposit"><input id="deposit-vault" /><input id="deposit-nft" /><input id="deposit-token" /><button id="deposit">deposit</button><div id="deposit-result"></div></section>
      <section id="tab-verify"><textarea id="plan"></textarea><button id="verify">verify</button><div id="verify-result"></div></section>
    </main>`;
  return { doc: window.document as unknown as Document, window };
}

function wallet(overrides: Partial<EthereumProvider> = {}): EthereumProvider & { calls: { method: string; params?: unknown[] }[] } {
  const calls: { method: string; params?: unknown[] }[] = [];
  const provider: EthereumProvider = {
    async request(args) {
      calls.push(args);
      if (args.method === "eth_requestAccounts") return ["0x25063c2210a0BCcCE3e15d250573179483275f22"];
      if (args.method === "eth_chainId") return "0xc4";
      if (args.method === "eth_sendTransaction") return "0x" + "ab".repeat(32);
      return "0x0";
    },
    ...overrides,
  };
  return Object.assign(provider, { calls });
}

describe("web app component", () => {
  test("renders a PROTECTED inspection with observed scope and warnings", async () => {
    const { doc } = dom();
    const app = createApp(doc, { fetch: async () => Response.json(site) });
    await app.inspect();
    const html = doc.getElementById("status-result")!.innerHTML;
    expect(html).toContain("PROTECTED");
    expect(html).toContain("Observed block");
    expect(html).toContain("fixture warning");
    expect(html).toContain("Vault 0x67d269…f55933");
  });

  test("renders inspect errors without claiming protection", async () => {
    const { doc } = dom();
    const app = createApp(doc, { fetch: async () => Response.json({ error: "RPC_DISAGREEMENT" }, { status: 400 }) });
    await app.inspect();
    expect(doc.getElementById("status-result")!.innerHTML).toContain("RPC_DISAGREEMENT");
  });

  test("rejects a deployment transaction with the wrong chain before touching the wallet", async () => {
    const { doc } = dom();
    const mock = wallet();
    doc.getElementById("deploy-tx")!.textContent = JSON.stringify({ chainId: 1, to: null, data: "0x60006000", value: "0" });
    const app = createApp(doc, { fetch: async () => Response.json({}), ethereum: mock });
    await app.deploy();
    expect(doc.getElementById("deploy-result")!.innerHTML).toContain("chainId must be 196");
    expect(mock.calls).toEqual([]);
  });

  test("reports a wrong wallet network on deployment", async () => {
    const { doc } = dom();
    const mock = wallet({ request: async (args) => args.method === "eth_chainId" ? "0x1" : ["0x25063c2210a0BCcCE3e15d250573179483275f22"] });
    doc.getElementById("deploy-tx")!.textContent = JSON.stringify({ chainId: 196, to: null, data: "0x60006000", value: "0" });
    const app = createApp(doc, { fetch: async () => Response.json({}), ethereum: mock });
    await app.deploy();
    expect(doc.getElementById("deploy-result")!.innerHTML).toContain("wrong network");
  });

  test("submits a deposit only after the server returns the exact transaction", async () => {
    const { doc } = dom();
    const mock = wallet();
    doc.getElementById("deposit-vault")!.textContent = "0x67d269191c92Caf3cD7723F116c85e6E9bf55933";
    doc.getElementById("deposit-nft")!.textContent = "0x68f65046fDEab90d8dB376C27B5E6AE159d240cc";
    doc.getElementById("deposit-token")!.textContent = "10";
    const app = createApp(doc, {
      fetch: async () => Response.json({ transaction: { to: "0x68f65046fDEab90d8dB376C27B5E6AE159d240cc", data: "0xabcdef", value: "0" } }),
      ethereum: mock,
    });
    await app.deposit();
    expect(doc.getElementById("deposit-result")!.innerHTML).toContain("Deposit transaction submitted");
    expect(mock.calls.some((call) => call.method === "eth_sendTransaction")).toBe(true);
  });

  test("renders RPC disagreement from release verification", async () => {
    const { doc } = dom();
    doc.getElementById("plan")!.textContent = "{}";
    const app = createApp(doc, { fetch: async () => Response.json({ status: "RPC_DISAGREEMENT", blockNumber: "1", errors: ["providers disagree"] }) });
    await app.verify();
    expect(doc.getElementById("verify-result")!.innerHTML).toContain("RPC_DISAGREEMENT");
    expect(doc.getElementById("verify-result")!.innerHTML).toContain("disagree");
  });

  test("mountApp switches tabs and binds buttons", () => {
    const { doc } = dom();
    const app = mountApp(doc, { fetch: async () => Response.json(site) });
    const deployTab = doc.querySelector<HTMLButtonElement>('[data-tab="deploy"]')!;
    deployTab.dispatchEvent(new (doc.defaultView as unknown as { Event: typeof Event }).Event("click"));
    expect(doc.getElementById("tab-deploy")!.classList.contains("active")).toBe(true);
    expect(app).toBeDefined();
  });
});
