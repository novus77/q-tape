import { describe, expect, test } from "bun:test";
import {
  BACKUP_CHECK_DOMAIN,
  GUARDIAN_DOMAIN,
  LAB_DOMAIN,
  buildRotateKeyCall,
  encodeBackupCheck,
  encodeKeyProof,
  encodeRequest,
  encodeRequestDigest,
  publicKeyFingerprint,
} from "../src/index.js";

const vectors = await Bun.file(new URL("./vectors/request-vectors.json", import.meta.url)).json();

describe("fixed request vectors (independently computed with cast)", () => {
  for (const vector of vectors.requests) {
    test(vector.name, () => {
      const encoded = encodeRequest(vector.request);
      expect(encoded.callsHash).toBe(vector.callsHash);
      expect(encoded.digest).toBe(vector.digest);
    });
  }

  test("experimental domain is a distinct vector and never matches production", () => {
    const vector = vectors.requests[0];
    const callsHash = encodeRequest(vector.request).callsHash;
    const labDigest = encodeRequestDigest({
      domain: LAB_DOMAIN,
      chainId: "196",
      guardian: vector.request.guardian,
      operation: 0,
      callsHash,
      nonce: "7",
      expiry: "2000000000",
    });
    expect(labDigest).toBe(vector.labDigest);
    expect(labDigest).not.toBe(vector.digest);
    expect(GUARDIAN_DOMAIN).not.toBe(LAB_DOMAIN);
  });

  test("changing guardian changes the digest", () => {
    const vector = vectors.requests[0];
    const { callsHash } = encodeRequest(vector.request);
    const digest = encodeRequestDigest({
      domain: GUARDIAN_DOMAIN,
      chainId: "196",
      guardian: "0x2222222222222222222222222222222222222222",
      operation: 0,
      callsHash,
      nonce: "7",
      expiry: "2000000000",
    });
    expect(digest).toBe(vector.wrongGuardianDigest);
  });

  test("batch order changes callsHash and digest", () => {
    const vector = vectors.requests[1];
    const reversed = { ...vector.request, calls: [...vector.request.calls].reverse() };
    expect(encodeRequest(reversed).callsHash).not.toBe(vector.callsHash);
    expect(encodeRequest(reversed).digest).not.toBe(vector.digest);
  });

  test("changing chainId or expiry changes the digest", () => {
    const vector = vectors.requests[0];
    const { callsHash } = encodeRequest(vector.request);
    const fields = {
      domain: GUARDIAN_DOMAIN,
      chainId: "197",
      guardian: vector.request.guardian,
      operation: 0 as const,
      callsHash,
      nonce: "7",
      expiry: "2000000000",
    };
    expect(encodeRequestDigest(fields)).not.toBe(vector.digest);
    expect(encodeRequestDigest({ ...fields, chainId: "196", expiry: "2000000001" })).not.toBe(vector.digest);
  });
});

describe("KeyProof and backup vectors", () => {
  test("KeyProof matches independent encoding", () => {
    const encoded = encodeKeyProof(vectors.keyProof);
    expect(encoded.message).toBe(vectors.keyProof.message);
    expect(encoded.digest).toBe(vectors.keyProof.digest);
  });

  test("KeyProof binds chain, vault, key and challenge independently", () => {
    const base = vectors.keyProof;
    const digest = encodeKeyProof(base).digest;
    expect(encodeKeyProof({ ...base, chainId: "197" }).digest).not.toBe(digest);
    expect(encodeKeyProof({ ...base, vault: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }).digest).not.toBe(digest);
    expect(encodeKeyProof({ ...base, publicKey: "0x09010204" }).digest).not.toBe(digest);
    expect(encodeKeyProof({ ...base, challenge: "0x" + "89".repeat(32) }).digest).not.toBe(digest);
  });

  test("backup check matches independent encoding", () => {
    const encoded = encodeBackupCheck(vectors.backupCheck);
    expect(encoded.message).toBe(vectors.backupCheck.message);
    expect(encoded.digest).toBe(vectors.backupCheck.digest);
    expect(BACKUP_CHECK_DOMAIN).toBe("Q-Tape backup check v1");
  });

  test("rotate key call encodes the exact ABI tuple", () => {
    const call = buildRotateKeyCall(vectors.rotateKeyCall);
    expect(call.target).toBe(vectors.rotateKeyCall.vault);
    expect(call.value).toBe("0");
    expect(call.data).toBe(vectors.rotateKeyCall.data);
  });

  test("public key fingerprint is keccak256 of the bytes", () => {
    expect(publicKeyFingerprint("0x09010203")).toBe("0x0476e30f0057db81721e047fa78b9e88d76e6895a462b60b7b5132d398b1fc57");
  });
});
