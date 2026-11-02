import {
  OPERATION,
  parseAddress,
  parseBytes32,
  parseHexData,
  parseRequestV1,
  parseUint256,
  type CallV1,
  type Hex,
  type Operation,
  type RequestV1,
} from "@qtape/schema";
import { decodeAbiParameters, encodeAbiParameters, keccak256, stringToHex } from "viem";

export const GUARDIAN_DOMAIN = "Q-Tape Guardian v1";
export const LAB_DOMAIN = "Q-Tape lab Guardian v1";
export const KEY_POSSESSION_DOMAIN = "Q-Tape key possession v1";
export const BACKUP_CHECK_DOMAIN = "Q-Tape backup check v1";

export const CALL_TUPLE = {
  type: "tuple[]",
  components: [
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
} as const;

export interface EncodedRequest {
  callsHash: Hex;
  digest: Hex;
}

export interface DigestFields {
  domain: string;
  chainId: string | bigint;
  guardian: Hex;
  operation: Operation;
  callsHash: Hex;
  nonce: string | bigint;
  expiry: string | bigint;
}

export function encodeCalls(calls: readonly CallV1[]): Hex {
  return keccak256(
    encodeAbiParameters(
      [CALL_TUPLE],
      [
        calls.map((call) => ({
          target: parseAddress(call.target, "call.target"),
          value: BigInt(parseUint256(call.value, "call.value")),
          data: parseHexData(call.data, "call.data"),
        })),
      ],
    ),
  );
}

export function encodeRequestDigest(fields: DigestFields): Hex {
  const operation = fields.operation;
  if (operation !== OPERATION.EXECUTE && operation !== OPERATION.EXIT && operation !== OPERATION.ROTATE_KEY) {
    throw new Error("INVALID_OPERATION: operation must be 0, 1 or 2");
  }
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint8" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        keccak256(stringToHex(fields.domain)),
        BigInt(parseUint256(fields.chainId.toString(), "chainId")),
        parseAddress(fields.guardian, "guardian"),
        operation,
        parseBytes32(fields.callsHash, "callsHash"),
        BigInt(parseUint256(fields.nonce.toString(), "nonce")),
        BigInt(parseUint256(fields.expiry.toString(), "expiry")),
      ],
    ),
  );
}

export function encodeRequest(request: RequestV1): EncodedRequest {
  const parsed = parseRequestV1(request);
  const callsHash = encodeCalls(parsed.calls);
  return {
    callsHash,
    digest: encodeRequestDigest({
      domain: GUARDIAN_DOMAIN,
      chainId: parsed.chainId,
      guardian: parsed.guardian,
      operation: parsed.operation,
      callsHash,
      nonce: parsed.nonce,
      expiry: parsed.expiry,
    }),
  };
}

export function encodeKeyProof(input: {
  chainId: string | bigint;
  vault: string;
  publicKey: Hex;
  challenge: string;
}): { message: Hex; digest: Hex } {
  const message = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
    [
      keccak256(stringToHex(KEY_POSSESSION_DOMAIN)),
      BigInt(parseUint256(input.chainId.toString(), "chainId")),
      parseAddress(input.vault, "vault"),
      keccak256(parseHexData(input.publicKey, "publicKey")),
      parseBytes32(input.challenge, "challenge"),
    ],
  );
  return { message, digest: keccak256(message) };
}

export function encodeBackupCheck(input: { publicKey: Hex; challenge: string }): { message: Hex; digest: Hex } {
  const message = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }],
    [
      keccak256(stringToHex(BACKUP_CHECK_DOMAIN)),
      keccak256(parseHexData(input.publicKey, "publicKey")),
      parseBytes32(input.challenge, "challenge"),
    ],
  );
  return { message, digest: keccak256(message) };
}

export function buildRotateKeyCall(input: {
  vault: string;
  newKey: Hex;
  challenge: string;
  proof: Hex;
}): CallV1 {
  return {
    target: parseAddress(input.vault, "vault"),
    value: "0",
    data: encodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes32" }, { type: "bytes" }],
      [parseHexData(input.newKey, "newKey"), parseBytes32(input.challenge, "challenge"), parseHexData(input.proof, "proof")],
    ),
  };
}

export function decodeRotateKeyData(data: Hex): { newKey: Hex; challenge: Hex; proof: Hex } {
  const [newKey, challenge, proof] = decodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes32" }, { type: "bytes" }],
    parseHexData(data, "data"),
  );
  return {
    newKey: newKey as Hex,
    challenge: challenge as Hex,
    proof: proof as Hex,
  };
}

export function publicKeyFingerprint(publicKey: Hex): Hex {
  return keccak256(parseHexData(publicKey, "publicKey"));
}

export function operationName(operation: Operation): string {
  if (operation === OPERATION.EXECUTE) return "EXECUTE";
  if (operation === OPERATION.EXIT) return "EXIT";
  return "ROTATE_KEY";
}
