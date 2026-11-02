import { describe, expect, test } from "bun:test";
import {
  FALCON512_PUBLIC_KEY_BYTES,
  FALCON512_SECRET_KEY_BYTES,
  SchemaError,
  type SchemaErrorCode,
  createKeyBundleV1,
  parseKeyBundleV1,
  parseRequestV1,
  parseSignedRequestV1,
} from "../src/index.js";

const validRequest = {
  schema: "qtape.request.v1",
  chainId: "196",
  guardian: "0x1111111111111111111111111111111111111111",
  operation: 0,
  calls: [{ target: "0x2222222222222222222222222222222222222222", value: "0", data: "0xdeadbeef" }],
  nonce: "7",
  expiry: "2000000000",
};

function expectCode(fn: () => unknown, code: SchemaErrorCode) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaError);
    expect((error as SchemaError).code).toBe(code);
    return;
  }
  throw new Error(`expected SchemaError ${code}`);
}

describe("RequestV1", () => {
  test("accepts canonical request and normalizes addresses", () => {
    const parsed = parseRequestV1({ ...validRequest, guardian: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
    expect(parsed.guardian).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(parsed.calls[0]?.value).toBe("0");
  });

  test("preserves uint256 values above Number.MAX_SAFE_INTEGER", () => {
    const parsed = parseRequestV1({ ...validRequest, nonce: "9007199254740993" });
    expect(parsed.nonce).toBe("9007199254740993");
    expect(BigInt(parsed.nonce)).toBe(9007199254740993n);
  });

  test("rejects number-typed uint256 values", () => {
    expectCode(() => parseRequestV1({ ...validRequest, nonce: 7 }), "INVALID_UINT256");
  });

  test("rejects leading zeros and overflow", () => {
    expectCode(() => parseRequestV1({ ...validRequest, nonce: "007" }), "INVALID_UINT256");
    expectCode(
      () => parseRequestV1({ ...validRequest, expiry: "115792089237316195423570985008687907853269984665640564039457584007913129639936" }),
      "INVALID_UINT256",
    );
  });

  test("rejects odd-length hex", () => {
    expectCode(
      () => parseRequestV1({ ...validRequest, calls: [{ ...validRequest.calls[0], data: "0xabc" }] }),
      "INVALID_HEX",
    );
  });

  test("rejects wrong operation, schema, empty calls and unknown fields", () => {
    expectCode(() => parseRequestV1({ ...validRequest, operation: 3 }), "INVALID_OPERATION");
    expectCode(() => parseRequestV1({ ...validRequest, schema: "qtape.request.v2" }), "INVALID_SCHEMA");
    expectCode(() => parseRequestV1({ ...validRequest, calls: [] }), "EMPTY_CALLS");
    expectCode(() => parseRequestV1({ ...validRequest, extra: true }), "UNKNOWN_FIELD");
  });

  test("parses signed request envelope", () => {
    const signed = parseSignedRequestV1({
      request: validRequest,
      signature: "0x00",
      digest: "0x" + "11".repeat(32),
    });
    expect(signed.signature).toBe("0x00");
    expect(signed.request.nonce).toBe("7");
  });
});

describe("KeyBundleV1", () => {
  const publicKey = new Uint8Array(FALCON512_PUBLIC_KEY_BYTES);
  publicKey[0] = 0x09;
  const secretKey = new Uint8Array(FALCON512_SECRET_KEY_BYTES);
  secretKey[0] = 0x7f;

  test("builds and parses a valid bundle", () => {
    const bundle = createKeyBundleV1({ publicKey, secretKey, createdAt: "2026-11-02T00:00:00.000Z" });
    const parsed = parseKeyBundleV1(bundle);
    expect(parsed.publicKey.length).toBe(2 + FALCON512_PUBLIC_KEY_BYTES * 2);
    expect(parsed.algorithm).toBe("falcon-512-pqclean-round3-v1.2");
  });

  test("rejects invalid public key header and length", () => {
    const wrongHeader = new Uint8Array(publicKey);
    wrongHeader[0] = 0x08;
    expectCode(() => createKeyBundleV1({ publicKey: wrongHeader, secretKey }), "INVALID_PUBLIC_KEY");
    expectCode(
      () => createKeyBundleV1({ publicKey: new Uint8Array(10), secretKey }),
      "INVALID_PUBLIC_KEY",
    );
  });

  test("rejects invalid secret key length and algorithm", () => {
    expectCode(
      () => createKeyBundleV1({ publicKey, secretKey: new Uint8Array(10) }),
      "INVALID_SECRET_KEY",
    );
    const bundle = createKeyBundleV1({ publicKey, secretKey });
    expectCode(() => parseKeyBundleV1({ ...bundle, algorithm: "falcon-1024" }), "INVALID_ALGORITHM");
  });
});
