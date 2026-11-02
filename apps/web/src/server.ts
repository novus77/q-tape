import { resolve } from "node:path";
import {
  buildDepositPlan,
  getProfile,
  inspectSite,
  readVaultState,
  verifyRelease,
  type ReleasePlan,
} from "@qtape/client";

const port = Number(process.env.Q_TAPE_WEB_PORT ?? "8790");
const profile = getProfile(process.env.Q_TAPE_WEB_PROFILE);
const rpcUrls = (process.env.Q_TAPE_WEB_RPC_URLS ?? profile.runtimeRpcUrls.join(",")).split(",").map((value) => value.trim()).filter(Boolean);
if (rpcUrls.length < 2) console.warn("warning: Q_TAPE_WEB_RPC_URLS has fewer than two operators; protection and verification will fail closed");
const root = resolve(import.meta.dir, "..");
const buildResult = await Bun.build({ entrypoints: [resolve(root, "src/client.ts")], outdir: resolve(root, "public/build"), target: "browser", minify: false });
if (!buildResult.success) {
  console.error(buildResult.logs.map((log) => String(log)).join("\n"));
  process.exit(1);
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(Bun.file(resolve(root, "public/index.html")), { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (url.pathname === "/assets/client.js") {
        return new Response(Bun.file(resolve(root, "public/build/client.js")), { headers: { "content-type": "text/javascript; charset=utf-8" } });
      }
      if (url.pathname === "/api/health") {
        return json({ ok: true, profile: profile.id, chainId: profile.chainId });
      }
      if (url.pathname === "/api/inspect" && request.method === "GET") {
        const site = url.searchParams.get("site");
        if (!site) return json({ error: "site is required" }, 400);
        const result = await inspectSite({ site, rpcUrls, blockNumber: url.searchParams.get("block") ?? undefined });
        return json(result);
      }
      if (url.pathname === "/api/vault" && request.method === "GET") {
        const vault = url.searchParams.get("address");
        if (!vault) return json({ error: "address is required" }, 400);
        return json(await readVaultState({ vault, rpcUrls }));
      }
      if (url.pathname === "/api/deposit" && request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;
        if (typeof body.vault !== "string" || typeof body.nft !== "string" || typeof body.tokenId !== "string" || typeof body.from !== "string") {
          return json({ error: "vault, nft, tokenId and from are required" }, 400);
        }
        return json(buildDepositPlan({ vault: body.vault, nft: body.nft, tokenId: body.tokenId, from: body.from }));
      }
      if (url.pathname === "/api/verify" && request.method === "POST") {
        const body = (await request.json()) as { plan?: ReleasePlan; blockNumber?: string };
        if (!body.plan) return json({ error: "plan is required" }, 400);
        return json(await verifyRelease({ plan: body.plan, rpcUrls, blockNumber: body.blockNumber }));
      }
      return json({ error: "not found" }, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  },
});
console.log(JSON.stringify({ web: "listening", url: `http://127.0.0.1:${server.port}`, profile: profile.id, operators: rpcUrls.length }));

export { server };

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2), { status, headers: { "content-type": "application/json" } });
}
