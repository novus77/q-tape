import { describe, expect, test } from "bun:test";
import { inspectionRows, protectionTone, shortAddress, validatePreparedTransaction, verificationSummary } from "../src/view.js";
import type { SiteInspection } from "@qtape/client";

const site: SiteInspection = {
  site: "10.2.4.tape",
  chainId: 196,
  blockNumber: "74818827",
  blockHash: "0xb8433ae3f968b1e3326113a94a549577c836d45556320e861ec6667a9a3742c2",
  profile: "xlayer-196",
  processor: "0x68f65046fDEab90d8dB376C27B5E6AE159d240cc",
  processorNumber: 4,
  tokenId: "10",
  container: "0xC0B4900262d0bC13F2C67C0Fc4CF92c04E0aB814",
  holder: "0x25063c2210a0BCcCE3e15d250573179483275f22",
  opened: true,
  live: true,
  paidUntil: "1795513090",
  protection: "UNPROTECTED",
  vault: null,
  implementations: {
    siteRegistry: "0xa85c4143d1d4a77f54b8e4ecc9e6d1418afea45f",
    domainBinding: "0x5ebf29b80789e548907c707530c3c7607c4347df",
  },
  warnings: [],
};

describe("web view models", () => {
  test("maps every protection status to a visual tone", () => {
    expect(protectionTone("PROTECTED")).toBe("ok");
    expect(protectionTone("UNPROTECTED")).toBe("warn");
    expect(protectionTone("DEPOSITED_UNVERIFIED")).toBe("warn");
    expect(protectionTone("CONFIG_CHANGED")).toBe("danger");
    expect(protectionTone("UNSUPPORTED")).toBe("danger");
    expect(protectionTone("EXITED")).toBe("muted");
  });

  test("builds inspection rows with the observation block and scope", () => {
    const rows = inspectionRows(site);
    expect(rows.map((row) => row.label)).toContain("Observed block");
    expect(rows.find((row) => row.label === "Protection")?.value).toBe("UNPROTECTED");
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x123456…345678");
  });

  test("validates prepared deployment transaction before wallet submission", () => {
    expect(validatePreparedTransaction({ chainId: 196, to: null, data: "0x60006000", value: "0" }, 196).ok).toBe(true);
    expect(validatePreparedTransaction({ chainId: 1, to: null, data: "0x60006000", value: "0" }, 196).ok).toBe(false);
    expect(validatePreparedTransaction({ chainId: 196, to: "0x1234567890123456789012345678901234567890", data: "0x6000", value: "0" }, 196).ok).toBe(false);
    expect(validatePreparedTransaction({ chainId: 196, to: null, data: "0xzz", value: "0" }, 196).ok).toBe(false);
  });

  test("summarizes verification states without claiming success on disagreement", () => {
    expect(verificationSummary({ status: "VERIFIED", blockNumber: "100", errors: [] })).toContain("Verified");
    expect(verificationSummary({ status: "RPC_DISAGREEMENT", blockNumber: "100", errors: [] })).toContain("disagree");
    expect(verificationSummary({ status: "FAILED", blockNumber: "100", errors: ["a", "b"] })).toContain("2 issue");
  });
});
