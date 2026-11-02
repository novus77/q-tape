import { describe, expect, test } from "bun:test";
import { encodeRequest } from "@qtape/client";
import { createRequestV1, type SignedRequestV1 } from "@qtape/schema";
import { createRelayerApp } from "../src/service.js";
import { RelayStore } from "../src/store.js";
import { RelayError } from "../src/errors.js";
import type { RelayChain, SimulationSummary } from "../src/chain.js";

class FakeChain implements RelayChain {
  submitted = 0;
  fail: RelayError | null = null;
  receiptStatus: "pending" | "success" | "reverted" = "success";
  chainId() { return 196; }
  async health() { return { blockNumber: "100" }; }
  async validateAndSimulate(): Promise<SimulationSummary> {
    if (this.fail) throw this.fail;
    return { gasEstimate: 3_000_000n, value: 0n };
  }
  async submit(): Promise<{ transactionHash: `0x${string}` }> {
    this.submitted += 1;
    return { transactionHash: `0x${this.submitted.toString(16).padStart(64, "0")}` };
  }
  async receipt() {
    return this.receiptStatus === "pending" ? { status: "pending" as const } : { status: this.receiptStatus, blockNumber: "101" };
  }
}

function signed(nonce = "0", expiry = "2000000000"): SignedRequestV1 {
  const request = createRequestV1({
    chainId: "196",
    guardian: "0x1111111111111111111111111111111111111111",
    operation: 0,
    calls: [{ target: "0x2222222222222222222222222222222222222222", value: "0", data: "0xdeadbeef" }],
    nonce,
    expiry,
  });
  const { digest } = encodeRequest(request);
  return { request, digest, signature: "0x00" };
}

function appWith(chain: FakeChain) {
  const store = new RelayStore(":memory:");
  const app = createRelayerApp({ store, chain });
  return { store, app };
}

async function post(app: ReturnType<typeof appWith>["app"], body: unknown): Promise<{ status: number; body: any }> {
  const response = await app.fetch(new Request("http://relay.test/v1/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
}

describe("relayer HTTP service", () => {
  test("returns 202 submitted and is idempotent for the same digest", async () => {
    const chain = new FakeChain();
    const { app } = appWith(chain);
    const request = signed();
    const first = await post(app, request);
    expect(first.status).toBe(202);
    expect(first.body.status).toBe("submitted");
    const second = await post(app, request);
    expect(second.status).toBe(202);
    expect(second.body.transactionHash).toBe(first.body.transactionHash);
    expect(chain.submitted).toBe(1);
  });

  test("rejects a forged digest without submitting", async () => {
    const chain = new FakeChain();
    const { app } = appWith(chain);
    const request = signed();
    request.digest = `0x${"11".repeat(32)}`;
    const result = await post(app, request);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("INVALID_REQUEST");
    expect(chain.submitted).toBe(0);
  });

  test("maps expired, nonce conflict and simulation failure to stable codes and aliases repeats", async () => {
    for (const [code, expected] of [["EXPIRED", "expired"], ["NONCE_CONFLICT", "reverted"], ["SIMULATION_FAILED", "reverted"]] as const) {
      const chain = new FakeChain();
      chain.fail = new RelayError(code, code, 422);
      const { app } = appWith(chain);
      const request = signed();
      const first = await post(app, request);
      expect(first.status).toBe(422);
      expect(first.body.error.code).toBe(code);
      expect(first.body.status).toBe(expected);
      const second = await post(app, request);
      expect(second.status).toBe(202);
      expect(second.body.status).toBe(expected);
      expect(chain.submitted).toBe(0);
    }
  });

  test("persists submitted status across restart and reconciles a receipt", async () => {
    const chain = new FakeChain();
    chain.receiptStatus = "pending";
    const store = new RelayStore(":memory:");
    const firstApp = createRelayerApp({ store, chain });
    const request = signed();
    const first = await post(firstApp, request);
    expect(first.body.status).toBe("submitted");
    chain.receiptStatus = "success";
    const secondApp = createRelayerApp({ store, chain });
    await secondApp.reconcile();
    const response = await secondApp.fetch(new Request(`http://relay.test/v1/requests/${request.digest}`));
    const body = await response.json() as { status: string; blockNumber: string };
    expect(body.status).toBe("confirmed");
    expect(body.blockNumber).toBe("101");
  });


  test("retries a persisted simulated record after restart instead of leaving it stuck", async () => {
    const chain = new FakeChain();
    const { store, app } = appWith(chain);
    const request = signed();
    const record = store.create(request.digest, JSON.stringify(request));
    store.update(record.digest, { status: "simulated", error: null });
    const result = await post(app, request);
    expect(result.status).toBe(202);
    expect(result.body.status).toBe("submitted");
    expect(chain.submitted).toBe(1);
  });
  test("health endpoint reports chain and block", async () => {
    const { app } = appWith(new FakeChain());
    const response = await app.fetch(new Request("http://relay.test/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, chainId: 196, blockNumber: "100" });
  });
});
