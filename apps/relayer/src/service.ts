import { QtapeClientError, encodeRequest } from "@qtape/client";
import { parseSignedRequestV1, type SignedRequestV1 } from "@qtape/schema";
import { RelayError } from "./errors.js";
import type { RelayChain } from "./chain.js";
import type { RelayStore, RequestRecord, RelayStatus } from "./store.js";

export interface RelayerAppOptions {
  store: RelayStore;
  chain: RelayChain;
  bodyLimitBytes?: number;
}

export interface RelayerApp {
  fetch(request: Request): Promise<Response>;
  reconcile(): Promise<void>;
}

export function createRelayerApp(options: RelayerAppOptions): RelayerApp {
  const bodyLimit = options.bodyLimitBytes ?? 1_000_000;

  async function reconcile(): Promise<void> {
    for (const record of options.store.listByStatuses(["submitted"])) {
      if (!record.transactionHash) continue;
      const receipt = await options.chain.receipt(record.transactionHash as `0x${string}`);
      if (receipt.status === "success") {
        options.store.update(record.digest, { status: "confirmed", blockNumber: receipt.blockNumber ?? null, error: null });
      } else if (receipt.status === "reverted") {
        options.store.update(record.digest, { status: "reverted", blockNumber: receipt.blockNumber ?? null, error: "transaction reverted" });
      }
    }
  }

  async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        const health = await options.chain.health();
        return json({ ok: true, chainId: options.chain.chainId(), blockNumber: health.blockNumber });
      }
      if (request.method === "GET" && url.pathname === "/metrics") {
        const health = await options.chain.health();
        return json({
          ok: true,
          chainId: options.chain.chainId(),
          blockNumber: health.blockNumber,
          requests: options.store.snapshot(),
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/requests") {
        return await handlePost(request);
      }
      const match = /^\/v1\/requests\/(0x[0-9a-fA-F]{64})$/.exec(url.pathname);
      if (request.method === "GET" && match) {
        await reconcile();
        const record = options.store.get(match[1]!.toLowerCase());
        if (!record) throw new RelayError("NOT_FOUND", "unknown request digest", 404);
        return json(recordResponse(record));
      }
      throw new RelayError("NOT_FOUND", "route not found", 404);
    } catch (error) {
      if (error instanceof RelayError) {
        return json({ error: { code: error.code, message: error.message } }, error.httpStatus);
      }
      if (error instanceof QtapeClientError) {
        return json({ error: { code: error.code, message: error.message } }, 422);
      }
      return json({ error: { code: "INTERNAL", message: error instanceof Error ? error.message : String(error) } }, 500);
    }
  }

  async function handlePost(request: Request): Promise<Response> {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > bodyLimit) {
      throw new RelayError("INVALID_REQUEST", "request body is too large", 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new RelayError("INVALID_REQUEST", "body must be JSON", 400);
    }
    let signed: SignedRequestV1;
    try {
      signed = parseSignedRequestV1(body);
    } catch (error) {
      throw new RelayError("INVALID_REQUEST", error instanceof Error ? error.message : String(error), 400);
    }
    const computed = encodeRequest(signed.request).digest;
    if (computed.toLowerCase() !== signed.digest.toLowerCase()) {
      throw new RelayError("INVALID_REQUEST", "signed request digest does not match its request fields", 400);
    }
    const digest = computed.toLowerCase();
    const existing = options.store.get(digest);
    if (existing) {
      if (existing.status === "submitted") {
        await reconcile();
        return json(recordResponse(options.store.get(digest)!), 202);
      }
      if (existing.status === "confirmed" || existing.status === "reverted" || existing.status === "expired" || existing.status === "unknown") {
        return json(recordResponse(existing), 202);
      }
    }
    let record = existing ?? options.store.create(digest, JSON.stringify(signed));
    try {
      const simulation = await options.chain.validateAndSimulate(signed);
      record = options.store.update(digest, { status: "simulated", error: null });
      const submitted = await options.chain.submit(signed, simulation);
      record = options.store.update(digest, {
        status: "submitted",
        transactionHash: submitted.transactionHash,
        error: null,
        incrementAttempts: true,
      });
      return json(recordResponse(record), 202);
    } catch (error) {
      if (error instanceof RelayError) {
        const status = statusForError(error.code);
        options.store.update(digest, { status, error: error.message });
        return json({ digest, status, error: { code: error.code, message: error.message } }, error.httpStatus);
      }
      options.store.update(digest, { status: "unknown", error: error instanceof Error ? error.message : String(error) });
      return json({
        digest,
        status: "unknown",
        error: { code: "INTERNAL", message: error instanceof Error ? error.message : String(error) },
      }, 500);
    }
  }

  return { fetch, reconcile };
}

function statusForError(code: string): RelayStatus {
  if (code === "EXPIRED") return "expired";
  if (code === "NONCE_CONFLICT") return "reverted";
  return "reverted";
}

function recordResponse(record: RequestRecord) {
  return {
    digest: record.digest,
    status: record.status,
    transactionHash: record.transactionHash,
    blockNumber: record.blockNumber,
    error: record.error,
    attempts: record.attempts,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
