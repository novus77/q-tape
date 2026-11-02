import type { SignedRequestV1 } from "@qtape/schema";
import { clientError } from "./errors.js";
import { assertDigestMatches, encodeExecuteData, totalCallValue } from "./simulate.js";
import type { Submission, SubmitSignedRequestInput, SubmitTransport } from "./types.js";

export async function submitSignedRequest(input: SubmitSignedRequestInput, transport: SubmitTransport): Promise<Submission> {
  const signedRequest = input.signedRequest;
  assertDigestMatches(signedRequest);
  if (input.expectedGuardian && input.expectedGuardian.toLowerCase() !== signedRequest.request.guardian.toLowerCase()) {
    clientError("INVALID_REQUEST", "signed request guardian does not match the expected vault");
  }
  if (input.expectedChainId !== undefined && BigInt(signedRequest.request.chainId) !== BigInt(input.expectedChainId)) {
    clientError("INVALID_REQUEST", "signed request chainId does not match the expected chain");
  }

  if (transport.type === "wallet") {
    let transactionHash: `0x${string}`;
    try {
      transactionHash = await transport.sendTransaction({
        to: signedRequest.request.guardian,
        data: encodeExecuteData(signedRequest),
        value: totalCallValue(signedRequest).toString(),
      });
    } catch (error) {
      clientError("SIMULATION_FAILED", `wallet rejected or broadcast failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const receipt = transport.waitForReceipt ? await transport.waitForReceipt(transactionHash) : null;
    return {
      digest: signedRequest.digest,
      status: receipt ? (receipt.status === "success" ? "confirmed" : "reverted") : "submitted",
      transactionHash,
      blockNumber: receipt?.blockNumber ?? null,
      error: receipt?.status === "reverted" ? "transaction reverted" : null,
    };
  }

  const fetchImpl = transport.fetch ?? fetch;
  const response = await fetchImpl(`${transport.url.replace(/\/$/, "")}/v1/requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(signedRequest),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const errorBody = body?.error as { code?: string; message?: string } | undefined;
    clientError(
      mapRelayerError(errorBody?.code),
      errorBody?.message ?? `relayer returned HTTP ${response.status}`,
    );
  }
  const status = typeof body?.status === "string" ? body.status : "unknown";
  return {
    digest: signedRequest.digest,
    status: status === "confirmed" ? "confirmed" : status === "reverted" ? "reverted" : status === "unknown" ? "unknown" : "submitted",
    transactionHash: (body?.transactionHash as `0x${string}` | null | undefined) ?? null,
    blockNumber: body?.blockNumber === undefined || body.blockNumber === null ? null : String(body.blockNumber),
    error: typeof body?.error === "string" ? body.error : null,
  };
}

function mapRelayerError(code: string | undefined): Parameters<typeof clientError>[0] {
  switch (code) {
    case "NONCE_CONFLICT":
    case "EXPIRED":
    case "INVALID_SIGNATURE":
    case "INVALID_REQUEST":
    case "SIMULATION_FAILED":
    case "BUDGET_EXCEEDED":
    case "UNSUPPORTED_PROFILE":
    case "RPC_DISAGREEMENT":
      return code;
    default:
      return "SIMULATION_FAILED";
  }
}
