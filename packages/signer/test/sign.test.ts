import { beforeAll, describe, expect, test } from "bun:test";
import {
  bytesToHex,
  encodeBase64,
  FALCON512_SIGNATURE_MAX_BYTES,
  type Hex,
} from "@qtape/schema";
import { encodeBackupCheck, encodeKeyProof } from "@qtape/protocol";
import {
  createBackupCheckSignature,
  createKeyBundle,
  createKeyProof,
  keygen,
  signDigest,
  verifySignature,
  type CreatedKeyBundle,
} from "../src/index.js";
import {
  TEST_BUNDLE_OPTIONS,
  TEST_PASSPHRASE,
  expectSignerError,
} from "./helpers.js";

const CHALLENGE = ("0x" + "ef".repeat(32)) as Hex;
const VAULT = ("0x" + "11".repeat(20)) as Hex;

let created: CreatedKeyBundle;
let digest: Hex;

beforeAll(async () => {
  created = await createKeyBundle(TEST_PASSPHRASE, { ...TEST_BUNDLE_OPTIONS });
  digest = encodeBackupCheck({ publicKey: created.bundle.publicKey, challenge: CHALLENGE }).digest;
});

describe("Falcon signing", () => {
  test("signDigest produces a real compressed Falcon-512 signature accepted by native verify", async () => {
    const signature = await signDigest({ digest, bundle: created.bundle });
    const signatureBytes = Buffer.from(signature.slice(2), "hex");
    expect(signatureBytes.length).toBeGreaterThan(0);
    expect(signatureBytes.length).toBeLessThanOrEqual(FALCON512_SIGNATURE_MAX_BYTES);
    expect(await verifySignature({ publicKey: created.bundle.publicKey, message: digest, signature })).toBe(true);
  });

  test("a signature over one digest is rejected for another digest", async () => {
    const signature = await signDigest({ digest, bundle: created.bundle });
    const otherDigest = encodeBackupCheck({
      publicKey: created.bundle.publicKey,
      challenge: ("0x" + "22".repeat(32)) as Hex,
    }).digest;
    expect(await verifySignature({
      publicKey: created.bundle.publicKey,
      message: otherDigest,
      signature,
    })).toBe(false);
  });

  test("a signature from a different key is rejected", async () => {
    const signature = await signDigest({ digest, bundle: created.bundle });
    const other = await keygen();
    expect(await verifySignature({
      publicKey: bytesToHex(other.publicKey),
      message: digest,
      signature,
    })).toBe(false);
    other.secretKey.fill(0);
  });

  test("createKeyProof matches the protocol encoder and verifies over the digest bytes", async () => {
    const proof = await createKeyProof({
      bundle: created.bundle,
      chainId: "196",
      vault: VAULT,
      challenge: CHALLENGE,
    });
    const expected = encodeKeyProof({
      chainId: "196",
      vault: VAULT,
      publicKey: created.bundle.publicKey,
      challenge: CHALLENGE,
    });

    expect(proof.message).toBe(expected.message);
    expect(proof.digest).toBe(expected.digest);
    expect(await verifySignature({
      publicKey: proof.publicKey,
      message: proof.digest,
      signature: proof.signature,
    })).toBe(true);
  });

  test("createBackupCheckSignature matches the protocol encoder and verifies", async () => {
    const signature = await createBackupCheckSignature({ bundle: created.bundle, challenge: CHALLENGE });
    const expected = encodeBackupCheck({ publicKey: created.bundle.publicKey, challenge: CHALLENGE });
    expect(signature.message).toBe(expected.message);
    expect(signature.digest).toBe(expected.digest);
    expect(await verifySignature({
      publicKey: signature.publicKey,
      message: signature.digest,
      signature: signature.signature,
    })).toBe(true);
  });

  test("native failure messages never contain secret key material or the passphrase", async () => {
    const brokenSecret = new Uint8Array(1281);
    const brokenBundle = { ...created.bundle, secretKey: encodeBase64(brokenSecret) };
    const error = await expectSignerError(
      () => signDigest({ digest, bundle: brokenBundle }),
      "SIGNER_FAILED",
    );
    expect(error.message).not.toContain(brokenBundle.secretKey);
    expect(error.message).not.toContain(TEST_PASSPHRASE);
    expect(error.message).not.toContain(Buffer.from(brokenSecret).toString("hex"));
  });
});
