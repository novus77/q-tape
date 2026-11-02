import { describe, expect, test } from "bun:test";
import { decodeFunctionData, getAddress } from "viem";
import { bindingAbi } from "../src/abi.js";
import { buildRenewalCall, calculateRenewalTotal, MAX_RENEWAL_MONTHS } from "../src/fees.js";

const binding = getAddress("0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9");
const container = getAddress("0xC0B4900262d0bC13F2C67C0Fc4CF92c04E0aB814");

describe("renewal fee arithmetic", () => {
  test("calculates zero and nonzero totals exactly", () => {
    expect(calculateRenewalTotal(0n, 1n)).toBe(0n);
    expect(calculateRenewalTotal(3n * 10n ** 18n, 2n)).toBe(6n * 10n ** 18n);
    expect(calculateRenewalTotal(1n, MAX_RENEWAL_MONTHS)).toBe(120n);
  });

  test("rejects out-of-range months and uint256 overflow", () => {
    expect(() => calculateRenewalTotal(1n, 0n)).toThrow("INVALID_INPUT");
    expect(() => calculateRenewalTotal(1n, MAX_RENEWAL_MONTHS + 1n)).toThrow("INVALID_INPUT");
    expect(() => calculateRenewalTotal((1n << 255n), 2n)).toThrow("INVALID_INPUT");
  });
});

describe("renewal call", () => {
  test("encodes canonical name, container and exact value", () => {
    const call = buildRenewalCall({
      binding,
      name: "10.2.4.tape",
      container,
      months: "2",
      total: "6000000000000000000",
    });
    expect(call.target).toBe(binding);
    expect(call.value).toBe("6000000000000000000");
    const decoded = decodeFunctionData({ abi: bindingAbi, data: call.data });
    expect(decoded.functionName).toBe("bind");
    expect(decoded.args).toEqual(["10.2.4.tape", container, 2n]);
  });

  test("rejects a short name because the signed bytes must be canonical", () => {
    expect(() => buildRenewalCall({ binding, name: "10.2.4", container, months: "1", total: "0" })).toThrow("canonical");
  });
});
