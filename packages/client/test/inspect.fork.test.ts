import { describe, expect, test } from "bun:test";
import { inspectSite } from "../src/inspect.js";

const RPC = ["http://127.0.0.1:18545", "http://127.0.0.1:18546"];
const BLOCK = "74818827";

describe.skipIf(process.env.Q_TAPE_RUN_FORK_TESTS !== "1")("inspectSite on the fixed X Layer fork", () => {
  test("resolves 10.2.4.tape and verifies pinned implementations", async () => {
    const site = await inspectSite({ site: "10.2.4.tape", rpcUrls: RPC, blockNumber: BLOCK });
    expect(site.chainId).toBe(196);
    expect(site.processor.toLowerCase()).toBe("0x68f65046fdeab90d8db376c27b5e6ae159d240cc");
    expect(site.container.toLowerCase()).toBe("0xc0b4900262d0bc13f2c67c0fc4cf92c04e0ab814");
    expect(site.tokenId).toBe("10");
    expect(site.opened).toBe(true);
    expect(site.live).toBe(true);
    expect(site.protection).toBe("UNPROTECTED");
    expect(site.implementations.siteRegistry.toLowerCase()).toBe("0xa85c4143d1d4a77f54b8e4ecc9e6d1418afea45f");
    expect(site.implementations.domainBinding.toLowerCase()).toBe("0x5ebf29b80789e548907c707530c3c7607c4347df");
  }, 30_000);

  test("rejects a name that is not on the profile chain", async () => {
    await expect(inspectSite({ site: "10.0.4.tape", rpcUrls: RPC, blockNumber: BLOCK })).rejects.toThrow("CHAIN_MISMATCH");
  });

  test("rejects single-provider protection checks", async () => {
    await expect(inspectSite({ site: "10.2.4.tape", rpcUrls: [RPC[0]!], blockNumber: BLOCK })).rejects.toThrow("two independent RPC providers");
  });

  test("reports a missing processor", async () => {
    await expect(inspectSite({ site: "10.2.9999.tape", rpcUrls: RPC, blockNumber: BLOCK })).rejects.toThrow("NO_SUCH_CPU");
  }, 30_000);
});
