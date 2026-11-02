import { afterAll, describe, expect, test } from "bun:test";
import { createProvider, resolvePinnedBlock } from "../src/rpc.js";

const servers: ReturnType<typeof Bun.serve>[] = [];

function fakeRpc(blockHash: string, blockNumber = 100): string {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as { id: number; method: string };
      const result = body.method === "eth_chainId"
        ? "0xc4"
        : body.method === "eth_blockNumber"
          ? `0x${blockNumber.toString(16)}`
          : body.method === "eth_getBlockByNumber"
            ? {
                number: `0x${blockNumber.toString(16)}`,
                hash: blockHash,
                parentHash: `0x${"11".repeat(32)}`,
                nonce: "0x0000000000000000",
                sha3Uncles: `0x${"22".repeat(32)}`,
                logsBloom: `0x${"00".repeat(256)}`,
                transactionsRoot: `0x${"33".repeat(32)}`,
                stateRoot: `0x${"44".repeat(32)}`,
                receiptsRoot: `0x${"55".repeat(32)}`,
                miner: "0x0000000000000000000000000000000000000000",
                difficulty: "0x0",
                totalDifficulty: "0x0",
                extraData: "0x",
                size: "0x0",
                gasLimit: "0x1c9c380",
                gasUsed: "0x0",
                timestamp: "0x65",
                transactions: [],
                uncles: [],
                baseFeePerGas: "0x1",
              }
            : { ok: true };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } });
    },
  });
  servers.push(server);
  return `http://127.0.0.1:${server.port}`;
}

afterAll(() => {
  for (const server of servers) server.stop(true);
});

describe("dual-operator pinning", () => {
  test("accepts two providers that agree on the block hash", async () => {
    const hash = `0x${"aa".repeat(32)}` as `0x${string}`;
    const result = await resolvePinnedBlock([
      createProvider(fakeRpc(hash), 196),
      createProvider(fakeRpc(hash), 196),
    ]);
    expect(result.number).toBe(100n);
    expect(result.hash).toBe(hash);
  });

  test("rejects providers that report different block hashes", async () => {
    await expect(resolvePinnedBlock([
      createProvider(fakeRpc(`0x${"aa".repeat(32)}`), 196),
      createProvider(fakeRpc(`0x${"bb".repeat(32)}`), 196),
    ])).rejects.toThrow("RPC_DISAGREEMENT");
  });
});
