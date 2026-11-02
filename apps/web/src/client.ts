import { inspectionRows, protectionTone, shortAddress, validatePreparedTransaction, verificationSummary } from "./view.js";

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const $ = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing element ${id}`);
  return element;
};

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
  button.addEventListener("click", () => {
    for (const other of document.querySelectorAll<HTMLButtonElement>("[data-tab]")) other.setAttribute("aria-selected", String(other === button));
    for (const section of document.querySelectorAll<HTMLElement>("main section")) section.classList.toggle("active", section.id === `tab-${button.dataset.tab}`);
  });
}

$("inspect").addEventListener("click", async () => {
  const result = $("status-result");
  result.textContent = "Reading two operators…";
  try {
    const params = new URLSearchParams({ site: (($("site") as HTMLInputElement).value || "10.2.4.tape").trim() });
    const block = (($("block") as HTMLInputElement).value || "").trim();
    if (block) params.set("block", block);
    const response = await fetch(`/api/inspect?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "inspect failed");
    renderInspection(result, data);
  } catch (error) {
    result.innerHTML = `<p class="error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
  }
});

$("deploy").addEventListener("click", async () => {
  const result = $("deploy-result");
  try {
    const raw = JSON.parse((($("deploy-tx") as HTMLTextAreaElement).value || "").trim());
    const checked = validatePreparedTransaction(raw.transaction ?? raw, 196);
    if (!checked.ok) throw new Error(checked.error);
    const account = await connectWallet();
    const hash = await window.ethereum!.request({
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
    result.innerHTML = `<p class="error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
  }
});

$("deposit").addEventListener("click", async () => {
  const result = $("deposit-result");
  try {
    const account = await connectWallet();
    const body = {
      vault: (($("deposit-vault") as HTMLInputElement).value || "").trim(),
      nft: (($("deposit-nft") as HTMLInputElement).value || "").trim(),
      tokenId: (($("deposit-token") as HTMLInputElement).value || "").trim(),
      from: account,
    };
    const response = await fetch("/api/deposit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "deposit build failed");
    const hash = await window.ethereum!.request({
      method: "eth_sendTransaction",
      params: [{ from: account, to: data.transaction.to, data: data.transaction.data, value: "0x0" }],
    });
    result.innerHTML = `<p>Deposit transaction submitted: <code>${escapeHtml(String(hash))}</code></p><p class="small">NFT 已迁入不等于保护已核验；请回到状态页确认 PROTECTED 与观察区块。</p>`;
  } catch (error) {
    result.innerHTML = `<p class="error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
  }
});

$("verify").addEventListener("click", async () => {
  const result = $("verify-result");
  try {
    const plan = JSON.parse((($("plan") as HTMLTextAreaElement).value || "").trim());
    const response = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "verify failed");
    const tone = data.status === "VERIFIED" ? "ok" : "danger";
    result.innerHTML = `<p><span class="status ${tone}">${escapeHtml(data.status)}</span> ${escapeHtml(verificationSummary(data))}</p>${data.errors.length ? `<ul class="warnings">${data.errors.map((item: string) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}`;
  } catch (error) {
    result.innerHTML = `<p class="error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
  }
});

function renderInspection(container: HTMLElement, site: Parameters<typeof inspectionRows>[0]): void {
  const tone = protectionTone(site.protection);
  container.innerHTML = `<p><span class="status ${tone}">${escapeHtml(site.protection)}</span></p>`;
  const table = document.createElement("table");
  for (const row of inspectionRows(site)) {
    const tr = document.createElement("tr");
    const key = document.createElement("td");
    key.textContent = row.label;
    const value = document.createElement("td");
    value.textContent = row.value;
    tr.append(key, value);
    table.append(tr);
  }
  container.append(table);
  if (site.warnings.length > 0) {
    const warnings = document.createElement("p");
    warnings.className = "warnings";
    warnings.textContent = site.warnings.join("; ");
    container.append(warnings);
  }
  if (site.vault) {
    const note = document.createElement("p");
    note.className = "small";
    note.textContent = `Vault ${shortAddress(site.vault.address)} · nonce ${site.vault.nonce} · key ${shortAddress(site.vault.keyFingerprint)}`;
    container.append(note);
  }
}

async function connectWallet(): Promise<string> {
  if (!window.ethereum) throw new Error("no browser wallet available");
  const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
  const account = accounts[0];
  if (!account) throw new Error("wallet returned no account");
  const chainId = (await window.ethereum.request({ method: "eth_chainId" })) as string;
  if (BigInt(chainId) !== 196n) throw new Error(`wrong network: wallet is on chain ${BigInt(chainId)}, expected 196`);
  return account;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
