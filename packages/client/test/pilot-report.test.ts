import { describe, expect, test } from "bun:test";
import { buildPilotReport } from "../src/pilot-report.js";

const evidence = {
  fixtureOnly: true,
  publicChainTransactionsBroadcast: 0,
  lastBlock: "12",
  releaseBatches: 1,
  files: [{ path: "index.html", ok: true }],
  steps: ["deposit-and-protected", "release-verified", "key-rotated", "exited"],
};

describe("pilot report builder", () => {
  test("accepts complete local fixture evidence", () => {
    const report = buildPilotReport({ environment: { profile: "fixture-local", chainId: 196 }, evidence });
    expect(report.status).toBe("LOCAL_VERIFIED");
    expect(report.errors).toEqual([]);
    expect(report.limitations[0]).toContain("fixture");
  });

  test("rejects public broadcasts and missing verification steps", () => {
    const report = buildPilotReport({
      environment: { profile: "fixture-local", chainId: 196 },
      evidence: { ...evidence, publicChainTransactionsBroadcast: 1, steps: ["deposit-and-protected"] },
    });
    expect(report.status).toBe("INCOMPLETE");
    expect(report.errors).toContain("public chain broadcasts are not allowed in a local pilot report");
    expect(report.errors).toContain("missing required step: release-verified");
    expect(report.errors).toContain("missing required step: key-rotated");
    expect(report.errors).toContain("missing required step: exited");
  });

  test("rejects non-fixture evidence and failed files", () => {
    const report = buildPilotReport({
      environment: { profile: "xlayer-196", chainId: 196 },
      evidence: { ...evidence, fixtureOnly: false, files: [{ path: "a", ok: false }] },
    });
    expect(report.status).toBe("INCOMPLETE");
    expect(report.errors).toContain("pilot report is local-fixture only; non-fixture evidence is not accepted by this builder");
    expect(report.errors).toContain("one or more release files failed verification");
  });
});
