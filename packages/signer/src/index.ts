export { SignerError, signerError } from "./errors.js";
export type { SignerErrorCode } from "./errors.js";
export {
  createKeyBundle,
  readKeyBundle,
  verifyBackup,
  writeKeyBundle,
} from "./bundle.js";
export type {
  BackupVerification,
  CreateKeyBundleOptions,
  CreatedKeyBundle,
  VerifyBackupInput,
} from "./bundle.js";
export {
  createBackupCheckSignature,
  createKeyProof,
  signDigest,
  verifySignature,
} from "./sign.js";
export type {
  BackupCheckSignature,
  CreateBackupCheckSignatureInput,
  CreateKeyProofInput,
  KeyProofSignature,
  SignDigestInput,
  VerifySignatureInput,
} from "./sign.js";
export { keygen, resolveBinaryPath, signWithSecretKey, verifyWithPublicKey } from "./native.js";
export type { NativeKeypair } from "./native.js";
