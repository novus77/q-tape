import { describe, expect, test } from "bun:test";
import { parseArgs, requireFlag, UsageError } from "../src/args.js";

describe("CLI argument parser", () => {
  test("separates command words from flags", () => {
    const args = parseArgs(["release", "plan", "dist", "--site", "10.2.4.tape", "--vault", "0x1234567890123456789012345678901234567890", "--json"]);
    expect(args.positional).toEqual(["release", "plan", "dist"]);
    expect(requireFlag(args, "site")).toBe("10.2.4.tape");
    expect(args.flags.get("json")).toBe(true);
  });

  test("collects repeated --rpc flags", () => {
    const args = parseArgs(["inspect", "10.2.4.tape", "--rpc", "http://a", "--rpc", "http://b"]);
    expect(args.lists.get("rpc")).toEqual(["http://a", "http://b"]);
  });

  test("rejects a flag without its required value", () => {
    const args = parseArgs(["inspect", "10.2.4.tape", "--site"]);
    expect(() => requireFlag(args, "site")).toThrow(UsageError);
  });

  test("supports equals form", () => {
    const args = parseArgs(["key", "create", "--out=/tmp/x.age"]);
    expect(requireFlag(args, "out")).toBe("/tmp/x.age");
  });
});
