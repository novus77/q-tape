import { encodeFunctionData, zeroAddress, type Hex } from "viem";
import { encodeRequest } from "@qtape/protocol";
import { parseSignedRequestV1 } from "@qtape/schema";
import { guardianAbi } from "./abi.js";
import { clientError } from "./errors.js";
import { createProvider } from "./rpc.js";
import type { SignedRequestV1 } from "@qtape/schema";

export interface SimulateInput {
  signedRequest: SignedRequestV1;
  rpcUrl: string;
  chainId: number;
  from?: Hex;
  gasBudget?: string | bigint;
}

export interface SimulationResult {
  gasEstimate: string;
  gasBudget: string | null;
  withinBudget: boolean;
}

export function encodeExecuteData(signedRequest: SignedRequestV1): Hex {
  const request = signedRequest.request;
  return encodeFunctionData({
    abi: guardianAbi,
    functionName: "execute",
    args: [
      request.operation,
      request.calls.map((call) => ({ target: call.target, value: BigInt(call.value), data: call.data })),
      BigInt(request.nonce),
      BigInt(request.expiry),
      signedRequest.signature,
    ],
  });
}

export function totalCallValue(signedRequest: SignedRequestV1): bigint {
  return signedRequest.request.calls.reduce((sum, call) => sum + BigInt(call.value), 0n);
}

export function assertDigestMatches(signedRequest: SignedRequestV1): void {
  const parsed = parseSignedRequestV1(signedRequest);
  const { digest } = encodeRequest(parsed.request);
  if (digest.toLowerCase() !== parsed.digest.toLowerCase()) {
    clientError("INVALID_REQUEST", `digest mismatch: computed ${digest}, signed object carries ${parsed.digest}`);
  }
}

export async function simulateSignedRequest(input: SimulateInput): Promise<SimulationResult> {
  assertDigestMatches(input.signedRequest);
  const provider = createProvider(input.rpcUrl, input.chainId);
  const data = encodeExecuteData(input.signedRequest);
  const value = totalCallValue(input.signedRequest);
  let gasEstimate: bigint;
  try {
    gasEstimate = await provider.client.estimateGas({
      account: input.from ?? zeroAddress,
      to: input.signedRequest.request.guardian,
      data,
      value,
    });
  } catch (error) {
    clientError("SIMULATION_FAILED", `signed request simulation reverted: ${shortError(error)}`);
  }
  const budget = input.gasBudget === undefined ? null : input.gasBudget.toString();
  return {
    gasEstimate: gasEstimate.toString(),
    gasBudget: budget,
    withinBudget: budget === null || gasEstimate <= BigInt(budget),
  };
}

function shortError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}
