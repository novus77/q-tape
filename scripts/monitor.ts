/**
 * M3 local monitoring probe. It is read-only and never signs or submits.
 *
 * Usage:
 *   bun scripts/monitor.ts --relayer http://127.0.0.1:8787 --rpc http://127.0.0.1:18545
 */
const args = process.argv.slice(2);
function flag(name: string, fallback?: string): string {
  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    if (fallback !== undefined) return fallback;
    throw new Error(`--${name} is required`);
  }
  const value = args[index + 1];
  if (!value) throw new Error(`--${name} requires a value`);
  return value;
}

const relayerUrl = flag("relayer", process.env.Q_TAPE_RELAYER_URL).replace(/\/$/, "");
const rpcUrl = flag("rpc", process.env.Q_TAPE_MONITOR_RPC_URL);
const expectedChainId = Number(flag("chain-id", process.env.Q_TAPE_MONITOR_CHAIN_ID ?? "196"));
const maxLag = BigInt(flag("max-lag", "300"));

async function jsonFetch(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return await response.json();
}

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(`RPC ${method}: ${body.error.message ?? "error"}`);
  return body.result;
}

try {
  const [health, metrics, chainIdHex, blockHex] = await Promise.all([
    jsonFetch(`${relayerUrl}/health`) as Promise<{ ok: boolean; chainId: number; blockNumber: string }>,
    jsonFetch(`${relayerUrl}/metrics`) as Promise<{ ok: boolean; requests: { total: number; byStatus: Record<string, number>; lastUpdatedAt: string | null } }>,
    rpc("eth_chainId") as Promise<string>,
    rpc("eth_blockNumber") as Promise<string>,
  ]);
  const rpcChainId = Number(BigInt(chainIdHex));
  const rpcBlock = BigInt(blockHex);
  const relayerBlock = BigInt(health.blockNumber);
  const lag = rpcBlock > relayerBlock ? rpcBlock - relayerBlock : 0n;
  const errors: string[] = [];
  if (!health.ok || !metrics.ok) errors.push("relayer health/metrics is not ok");
  if (health.chainId !== expectedChainId || rpcChainId !== expectedChainId) errors.push(`chain mismatch: relayer ${health.chainId}, rpc ${rpcChainId}, expected ${expectedChainId}`);
  if (lag > maxLag) errors.push(`relayer block lag ${lag} exceeds ${maxLag}`);
  const result = {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    relayer: { chainId: health.chainId, blockNumber: health.blockNumber, requests: metrics.requests },
    rpc: { chainId: rpcChainId, blockNumber: rpcBlock.toString(), lag: lag.toString() },
    errors,
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ ok: false, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}

export {};
