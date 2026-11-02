import { describe, expect, test } from "bun:test";
import { displayLabel, parseTapeName } from "../src/name.js";
import { normalizeSitePath, prepareArtifact, splitChunks, batchCalls, DEFAULT_RELEASE_LIMITS, estimateCallGas } from "../src/planner.js";
import type { PlannedCall } from "../src/types.js";

describe("TAP-10 names", () => {
  test("parses X Layer on-chain name", () => {
    const parsed = parseTapeName("10.2.4.tape");
    expect(parsed.onChainName).toBe("10.2.4.tape");
    expect(parsed.tokenId).toBe("10");
    expect(parsed.areaCode).toBe(2);
    expect(parsed.processorNumber).toBe(4);
    expect(displayLabel(parsed)).toBe("#10@2.4");
  });

  test("parses short and display forms identically", () => {
    expect(parseTapeName("10.2.4").onChainName).toBe("10.2.4.tape");
    expect(parseTapeName("#10@2.4").onChainName).toBe("10.2.4.tape");
    expect(parseTapeName("tape://10.2.4.tape/index.html").onChainName).toBe("10.2.4.tape");
  });

  test("rejects ambiguous or malformed names", () => {
    expect(() => parseTapeName("0.2.4.tape")).toThrow();
    expect(() => parseTapeName("10.02.4.tape")).toThrow();
    expect(() => parseTapeName("10.2.4.5.tape")).toThrow();
    expect(() => parseTapeName("../10.2.4.tape")).toThrow();
  });
});

describe("release artifact preparation", () => {
  test("hashes full file bytes and counts chunks", () => {
    const files = prepareArtifact(
      [
        { path: "index.html", content: new TextEncoder().encode("<h1>hello</h1>") },
        { path: "assets/app.js", content: new Uint8Array(DEFAULT_RELEASE_LIMITS.chunkBytes + 5) },
      ],
      DEFAULT_RELEASE_LIMITS,
    );
    expect(files[0]?.path).toBe("assets/app.js");
    expect(files[0]?.chunks).toBe(2);
    expect(files[1]?.sha256).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("rejects path escape, duplicates and oversize files", () => {
    const limits = DEFAULT_RELEASE_LIMITS;
    expect(() => prepareArtifact([{ path: "../secret", content: new Uint8Array() }], limits)).toThrow();
    expect(() => prepareArtifact([{ path: "/abs", content: new Uint8Array() }], limits)).toThrow();
    expect(() => prepareArtifact([{ path: "a", content: new Uint8Array() }, { path: "a", content: new Uint8Array() }], limits)).toThrow();
    expect(() => prepareArtifact([{ path: "big", content: new Uint8Array(limits.maxFileBytes + 1) }], limits)).toThrow();
    expect(normalizeSitePath("a/b/c.txt")).toBe("a/b/c.txt");
  });

  test("splits empty and multi-chunk files", () => {
    expect(splitChunks(new Uint8Array(), 3).length).toBe(1);
    expect(splitChunks(new Uint8Array([1, 2, 3, 4, 5]), 2).map((chunk) => chunk.length)).toEqual([2, 2, 1]);
  });

  test("batches by gas budget and call count", () => {
    const call: PlannedCall = {
      target: "0x1111111111111111111111111111111111111111",
      value: "0",
      data: "0x1234",
      kind: "putFile",
      path: "a",
    };
    const batches = batchCalls(Array.from({ length: 8 }, (): PlannedCall => ({ ...call, data: ("0x" + "00".repeat(12_000)) as `0x${string}` })), DEFAULT_RELEASE_LIMITS);
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) expect(BigInt(batch.estimatedGas) <= 8_000_000n).toBe(true);
    expect(estimateCallGas(call)).toBeGreaterThan(0n);
  });
});
