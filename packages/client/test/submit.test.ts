import { describe, expect, test } from "bun:test";
import { getSubmissionStatus } from "../src/submit.js";

const digest = `0x${"ab".repeat(32)}` as const;

describe("submission status recovery", () => {
  test("reads a confirmed relayer record without resubmitting", async () => {
    let called = 0;
    const result = await getSubmissionStatus(digest, {
      url: "https://relayer.example",
      fetch: (async (input) => {
        called += 1;
        expect(String(input)).toBe(`https://relayer.example/v1/requests/${digest}`);
        return Response.json({ status: "confirmed", transactionHash: `0x${"cd".repeat(32)}`, blockNumber: "123", error: null });
      }) as unknown as typeof fetch,
    });
    expect(called).toBe(1);
    expect(result.status).toBe("confirmed");
    expect(result.blockNumber).toBe("123");
  });

  test("maps unknown digest to NOT_FOUND", async () => {
    await expect(getSubmissionStatus(digest, {
      url: "https://relayer.example",
      fetch: (async () => Response.json({ error: { code: "NOT_FOUND", message: "unknown" } }, { status: 404 })) as unknown as typeof fetch,
    })).rejects.toThrow("NOT_FOUND");
  });
});
