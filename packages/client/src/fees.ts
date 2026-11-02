import { encodeFunctionData, type Hex } from "viem";
import { bindingAbi } from "./abi.js";
import { clientError } from "./errors.js";
import { parseTapeName } from "./name.js";
import type { ProviderContext } from "./rpc.js";
import type { PlannedCall } from "./types.js";

export const MAX_RENEWAL_MONTHS = 120n;

export interface RenewalQuote {
  name: string;
  container: Hex;
  months: string;
  monthlyFee: string;
  total: string;
  blockNumber: string;
}

export function calculateRenewalTotal(monthlyFee: bigint, months: bigint): bigint {
  if (monthlyFee < 0n) clientError("INVALID_INPUT", "monthly fee must be non-negative");
  if (months < 1n || months > MAX_RENEWAL_MONTHS) {
    clientError("INVALID_INPUT", `renewal months must be between 1 and ${MAX_RENEWAL_MONTHS}`);
  }
  const total = monthlyFee * months;
  if (total > (1n << 256n) - 1n) clientError("INVALID_INPUT", "renewal total exceeds uint256");
  return total;
}

export async function readRenewalQuote(input: {
  provider: ProviderContext;
  binding: Hex;
  name: string;
  container: Hex;
  months: string | bigint;
  blockNumber: bigint;
}): Promise<RenewalQuote> {
  const parsed = parseTapeName(input.name);
  if (parsed.onChainName !== input.name.toLowerCase()) {
    clientError("INVALID_INPUT", "renewal requires the canonical on-chain name");
  }
  const months = BigInt(input.months);
  const fee = await input.provider.client.readContract({
    address: input.binding,
    abi: bindingAbi,
    functionName: "monthlyFee",
    blockNumber: input.blockNumber,
  });
  return {
    name: parsed.onChainName,
    container: input.container,
    months: months.toString(),
    monthlyFee: fee.toString(),
    total: calculateRenewalTotal(fee, months).toString(),
    blockNumber: input.blockNumber.toString(),
  };
}

export function buildRenewalCall(input: {
  binding: Hex;
  name: string;
  container: Hex;
  months: string | bigint;
  total: string | bigint;
}): PlannedCall {
  const parsed = parseTapeName(input.name);
  if (parsed.onChainName !== input.name.toLowerCase()) clientError("INVALID_INPUT", "renewal requires the canonical on-chain name");
  const months = BigInt(input.months);
  if (months < 1n || months > MAX_RENEWAL_MONTHS) clientError("INVALID_INPUT", "renewal months out of range");
  return {
    target: input.binding,
    value: BigInt(input.total).toString(),
    data: encodeFunctionData({
      abi: bindingAbi,
      functionName: "bind",
      args: [parsed.onChainName, input.container, months],
    }),
    kind: "bind",
  };
}
