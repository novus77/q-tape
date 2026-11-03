import { describe, expect, test } from "bun:test";
import { XLAYER_MAINNET_PROFILE } from "../src/profiles.js";
import { checkPilotApproval, parsePilotApproval, PILOT_APPROVAL_SCHEMA } from "../src/pilot.js";

const approval = {
  schema: PILOT_APPROVAL_SCHEMA,
  approvedBy: "security-review.example",
  approvedAt: "2026-11-01T00:00:00.000Z",
  environment: { name: "xlayer-test", chainId: "196", rpcUrls: ["https://a.example", "https://b.example"] },
  site: "10.2.4.tape",
  vault: "0x1111111111111111111111111111111111111111",
  nft: "0x68f65046fDEab90d8dB376C27B5E6AE159d240cc",
  tokenId: "10",
  container: "0xC0B4900262d0bC13F2C67C0Fc4CF92c04E0aB814",
  scope: ["DEPLOY", "DEPOSIT", "PUBLISH", "RENEW", "ROTATE", "EXIT"],
  limits: { maxGasPerRequest: "8000000", maxTotalGas: "16000000", maxValue: "1000000000000000000" },
  externalReview: { status: "passed", reportHash: `0x${"ab".repeat(32)}`, reviewedCommit: "0123456789abcdef0123456789abcdef01234567" },
  expiresAt: "2099-01-01T00:00:00.000Z",
};

describe("pilot approval", () => {
  test("parses a complete approval with EXIT scope", () => {
    const parsed = parsePilotApproval(approval);
    expect(parsed.site).toBe("10.2.4.tape");
    expect(parsed.scope).toContain("EXIT");
    expect(parsed.vault).toBe("0x1111111111111111111111111111111111111111");
  });

  test("requires external review passed status and report hash", () => {
    expect(() => parsePilotApproval({ ...approval, externalReview: { ...approval.externalReview, status: "pending" } })).toThrow("INVALID_INPUT");
    expect(() => parsePilotApproval({ ...approval, externalReview: { ...approval.externalReview, reportHash: "0x00" } })).toThrow("INVALID_HEX");
    expect(() => parsePilotApproval({ ...approval, externalReview: { ...approval.externalReview, reviewedCommit: "abc" } })).toThrow("INVALID_INPUT");
  });

  test("rejects missing EXIT scope and excessive per-request gas", () => {
    expect(() => parsePilotApproval({ ...approval, scope: ["PUBLISH"] })).toThrow("EXIT");
    expect(() => parsePilotApproval({ ...approval, limits: { ...approval.limits, maxGasPerRequest: "8000001" } })).toThrow("8000000");
  });

  test("rejects expired approval and chain mismatch", () => {
    const parsed = parsePilotApproval(approval);
    const expired = checkPilotApproval(parsed, { profile: XLAYER_MAINNET_PROFILE, now: new Date("2100-01-01T00:00:00Z") });
    expect(expired.ok).toBe(false);
    expect(expired.errors.map((issue) => issue.code)).toContain("EXPIRED");
    const wrongChain = checkPilotApproval(parsed, { profile: { ...XLAYER_MAINNET_PROFILE, chainId: 1 } });
    expect(wrongChain.errors.map((issue) => issue.code)).toContain("CHAIN_MISMATCH");
  });

  test("checks observed site, container, token and vault binding", () => {
    const parsed = parsePilotApproval(approval);
    const good = checkPilotApproval(parsed, {
      profile: XLAYER_MAINNET_PROFILE,
      inspection: { site: "10.2.4.tape", container: approval.container as `0x${string}`, tokenId: "10", vault: { address: approval.vault as `0x${string}` } },
    });
    expect(good.ok).toBe(true);
    const bad = checkPilotApproval(parsed, {
      profile: XLAYER_MAINNET_PROFILE,
      inspection: { site: "10.2.4.tape", container: "0x2222222222222222222222222222222222222222", tokenId: "10", vault: null },
    });
    expect(bad.errors.map((issue) => issue.code)).toContain("CONTAINER_MISMATCH");
    expect(bad.errors.map((issue) => issue.code)).toContain("VAULT_NOT_PROTECTED");
  });
});
