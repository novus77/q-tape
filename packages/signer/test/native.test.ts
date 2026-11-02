import { describe, expect, test } from "bun:test";
import {
  FALCON512_PUBLIC_KEY_BYTES,
  FALCON512_SECRET_KEY_BYTES,
  FALCON512_SIGNATURE_MAX_BYTES,
} from "@qtape/schema";
import {
  keygen,
  resolveBinaryPath,
  signWithSecretKey,
  verifyWithPublicKey,
} from "../src/index.js";
import { expectSignerError } from "./helpers.js";

function frameSign(secretKey: Uint8Array, digest: Uint8Array): Uint8Array {
  const frame = new Uint8Array(4 + secretKey.length + digest.length);
  new DataView(frame.buffer).setUint32(0, secretKey.length, false);
  frame.set(secretKey, 4);
  frame.set(digest, 4 + secretKey.length);
  return frame;
}

describe("native Falcon-512 process protocol", () => {
  test("keygen returns a 897-byte Falcon-512 public key and 1281-byte secret key", async () => {
    const pair = await keygen();
    expect(pair.publicKey.length).toBe(FALCON512_PUBLIC_KEY_BYTES);
    expect(pair.publicKey[0]).toBe(0x09);
    expect(pair.secretKey.length).toBe(FALCON512_SECRET_KEY_BYTES);
    expect(pair.secretKey[0]).toBe(0x59);
    pair.secretKey.fill(0);
  });

  test("signing self-verifies and produces a real signature", async () => {
    const pair = await keygen();
    const digest = new Uint8Array(32).fill(0x42);
    const signature = await signWithSecretKey(pair.secretKey, digest);

    expect(signature.length).toBeGreaterThan(0);
    expect(signature.length).toBeLessThanOrEqual(FALCON512_SIGNATURE_MAX_BYTES);
    expect(await verifyWithPublicKey(pair.publicKey, digest, signature)).toBe(true);
    pair.secretKey.fill(0);
  });

  test("verification rejects a different digest, a tampered signature and a different key", async () => {
    const pair = await keygen();
    const other = await keygen();
    const digest = new Uint8Array(32).fill(0x11);
    const signature = await signWithSecretKey(pair.secretKey, digest);

    expect(await verifyWithPublicKey(pair.publicKey, new Uint8Array(32).fill(0x12), signature)).toBe(false);

    const tampered = signature.slice();
    const lastIndex = tampered.length - 1;
    tampered[lastIndex] = tampered[lastIndex]! ^ 0xff;
    expect(await verifyWithPublicKey(pair.publicKey, digest, tampered)).toBe(false);
    expect(await verifyWithPublicKey(other.publicKey, digest, signature)).toBe(false);

    pair.secretKey.fill(0);
    other.secretKey.fill(0);
  });

  test("invalid secret key length fails with SIGNER_FAILED and no key bytes in the message", async () => {
    const oversized = new Uint8Array(FALCON512_SECRET_KEY_BYTES + 1).fill(0x7f);
    const error = await expectSignerError(
      () => signWithSecretKey(oversized, new Uint8Array(32)),
      "SIGNER_FAILED",
    );
    expect(error.message).not.toContain(Buffer.from(oversized).toString("hex"));
  });

  test("missing native binary fails with SIGNER_UNAVAILABLE", async () => {
    await expectSignerError(
      () => keygen("/nonexistent/qtape-falcon-does-not-exist"),
      "SIGNER_UNAVAILABLE",
    );
  });

  test("native stderr never contains secret key bytes or passphrases", async () => {
    const secretKey = new Uint8Array(FALCON512_SECRET_KEY_BYTES).fill(0x5a);
    const process = Bun.spawn([resolveBinaryPath(), "sign"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = new Response(process.stdout).arrayBuffer();
    const stderr = new Response(process.stderr).text();
    try {
      process.stdin.write(frameSign(secretKey, new Uint8Array(32)));
      await process.stdin.end();
    } catch {
      // The native signer may close stdin after rejecting the invalid key.
    }
    const [stdoutBuffer, stderrText, exitCode] = await Promise.all([stdout, stderr, process.exited]);

    expect(exitCode).toBe(2);
    expect(new Uint8Array(stdoutBuffer).length).toBe(0);
    expect(stderrText).toBe("sign: invalid Falcon-512 secret key\n");
    expect(stderrText).not.toContain(Buffer.from(secretKey).toString("hex"));
    expect(stderrText).not.toContain(Buffer.from(secretKey).toString("base64"));
  });
});
