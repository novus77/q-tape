import { describe, expect, test } from "bun:test";
import { XLAYER_MAINNET_PROFILE } from "../src/profiles.js";

describe("fixed deployment profile", () => {
  test("JSON record matches the runtime profile", async () => {
    const record = await Bun.file(new URL("../config/profiles/xlayer-196.json", import.meta.url)).json();
    expect(record).toEqual(XLAYER_MAINNET_PROFILE);
  });
});
