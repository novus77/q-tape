import { inspectionRows, protectionTone, shortAddress, validatePreparedTransaction, verificationSummary } from "./view.js";
import type { SiteInspection } from "@qtape/client";

export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AppDeps {
  fetch: FetchLike;
  ethereum?: EthereumProvider;
  expectedChainId?: number;
}

export interface AppController {
  inspect(): Promise<void>;
  deploy(): Promise<void>;
  deposit(): Promise<void>;
  verify(): Promise<void>;
}

export function createApp(doc: Document, deps: AppDeps): AppController {
  const expectedChainId = deps.expectedChainId ?? 196;
  const $ = (id: string): HTMLElement => {
    const element = doc.getElementById(id);
    if (!element) throw new Error(`missing element ${id}`);
    return element;
  };

  async function inspect(): Promise<void> {
    const result = $("status-result");
    result.textContent = "Reading two operators…";
    try {
      const params = new URLSearchParams({ site: (($("site") as HTMLInputElement).value || "10.2.4.tape").trim() });
      const block = (($("block") as HTMLInputElement).value || "").trim();
      if (block) params.set("block", block);
      const response = await deps.fetch(`/api/inspect?${params}`);
      const data = await response.json() as SiteInspection & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "inspect failed");
      renderInspection(result, data);
    } catch (error) {
      result.innerHTML = `<p class="error">${escapeHtml(errorMessage(error))}</p>`;
    }
  }

  async function deploy(): Promise<void> {
    const result = $("deploy-result");
    try {
      const raw = JSON.parse((($("deploy-tx") as HTMLTextAreaElement).value || "").trim()) as { transaction?: unknown };
      const checked = validatePreparedTransaction(raw.transaction ?? raw, expectedChainId);
      if (!checked.ok) throw new Error(checked.error);
      const account = await connectWallet(deps.ethereum, expectedChainId);
      const hash = await deps.ethereum!.request({
        method: "eth_sendTransaction",
        params: [{
          from: account,
          ...(checked.transaction.to === null ? {} : { to: checked.transaction.to }),
          data: checked.transaction.data,
          value: `0x${BigInt(checked.transaction.value).toString(16)}`,
        }],
      });
      result.innerHTML = `<p>Deployment transaction submitted: <code>${escapeHtml(String(hash))}</code></p><p class="small">确认部署地址为 ${escapeHtml(checked.transaction.expectedAddress ?? "（prepare 输出缺失）")} 后，再执行 vault deposit。</p>`;
    } catch (error) {
      result.innerHTML = `<p class="error">${escapeHtml(errorMessage(error))}</p>`;
    }
  }

  async function deposit(): Promise<void> {
    const result = $("deposit-result");
    try {
      const account = await connectWallet(deps.ethereum, expectedChainId);
      const body = {
        vault: (($("deposit-vault") as HTMLInputElement).value || "").trim(),
        nft: (($("deposit-nft") as HTMLInputElement).value || "").trim(),
        tokenId: (($("deposit-token") as HTMLInputElement).value || "").trim(),
        from: account,
      };
      const response = await deps.fetch("/api/deposit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { transaction?: { to: string; data: string }; error?: string };
      if (!response.ok) throw new Error(data.error ?? "deposit build failed");
      const hash = await deps.ethereum!.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: data.transaction!.to, data: data.transaction!.data, value: "0x0" }],
      });
      result.innerHTML = `<p>Deposit transaction submitted: <code>${escapeHtml(String(hash))}</code></p><p class="small">NFT 已迁入不等于保护已核验；请回到状态页确认 PROTECTED 与观察区块。</p>`;
    } catch (error) {
      result.innerHTML = `<p class="error">${escapeHtml(errorMessage(error))}</p>`;
    }
  }

  async function verify(): Promise<void> {
    const result = $("verify-result");
    try {
      const plan = JSON.parse((($("plan") as HTMLTextAreaElement).value || "").trim()) as unknown;
      const response = await deps.fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
      const data = await response.json() as { status: string; blockNumber: string; errors: string[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "verify failed");
      const tone = data.status === "VERIFIED" ? "ok" : "danger";
      result.innerHTML = `<p><span class="status ${tone}">${escapeHtml(data.status)}</span> ${escapeHtml(verificationSummary(data))}</p>${data.errors.length ? `<ul class="warnings">${data.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}`;
    } catch (error) {
      result.innerHTML = `<p class="error">${escapeHtml(errorMessage(error))}</p>`;
    }
  }

  return { inspect, deploy, deposit, verify };
}

export function mountApp(doc: Document, deps: AppDeps): AppController {
  const app = createApp(doc, deps);
  for (const button of doc.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
    button.addEventListener("click", () => {
      for (const other of doc.querySelectorAll<HTMLButtonElement>("[data-tab]")) other.setAttribute("aria-selected", String(other === button));
      for (const section of doc.querySelectorAll<HTMLElement>("main section")) section.classList.toggle("active", section.id === `tab-${button.dataset.tab}`);
    });
  }
  doc.getElementById("inspect")?.addEventListener("click", () => { void app.inspect(); });
  doc.getElementById("deploy")?.addEventListener("click", () => { void app.deploy(); });
  doc.getElementById("deposit")?.addEventListener("click", () => { void app.deposit(); });
  doc.getElementById("verify")?.addEventListener("click", () => { void app.verify(); });
  return app;
}

export function renderInspection(container: HTMLElement, site: SiteInspection): void {
  const tone = protectionTone(site.protection);
  container.innerHTML = `<p><span class="status ${tone}">${escapeHtml(site.protection)}</span></p>`;
  const table = container.ownerDocument.createElement("table");
  for (const row of inspectionRows(site)) {
    const tr = container.ownerDocument.createElement("tr");
    const key = container.ownerDocument.createElement("td");
    key.textContent = row.label;
    const value = container.ownerDocument.createElement("td");
    value.textContent = row.value;
    tr.append(key, value);
    table.append(tr);
  }
  container.append(table);
  if (site.warnings.length > 0) {
    const warnings = container.ownerDocument.createElement("p");
    warnings.className = "warnings";
    warnings.textContent = site.warnings.join("; ");
    container.append(warnings);
  }
  if (site.vault) {
    const note = container.ownerDocument.createElement("p");
    note.className = "small";
    note.textContent = `Vault ${shortAddress(site.vault.address)} · nonce ${site.vault.nonce} · key ${shortAddress(site.vault.keyFingerprint)}`;
    container.append(note);
  }
}

export async function connectWallet(ethereum: EthereumProvider | undefined, expectedChainId: number): Promise<string> {
  if (!ethereum) throw new Error("no browser wallet available");
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
  const account = accounts[0];
  if (!account) throw new Error("wallet returned no account");
  const chainId = (await ethereum.request({ method: "eth_chainId" })) as string;
  if (BigInt(chainId) !== BigInt(expectedChainId)) {
    throw new Error(`wrong network: wallet is on chain ${BigInt(chainId)}, expected ${expectedChainId}`);
  }
  return account;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
