import type { CallV1, Hex, SignedRequestV1 } from "@qtape/schema";

export type ProtectionStatus =
  | "UNPROTECTED"
  | "VAULT_PREPARED"
  | "DEPOSITED_UNVERIFIED"
  | "PROTECTED"
  | "CONFIG_CHANGED"
  | "EXITED"
  | "UNSUPPORTED";

export type ReleaseStatus = "PLANNED" | "SIGNED" | "SUBMITTED" | "CONFIRMED" | "VERIFIED" | "FAILED" | "UNKNOWN";

export interface ChainProfile {
  id: string;
  chainId: number;
  areaCode: number;
  finalityTag: "safe" | "finalized";
  maxPinLag: number;
  factory: Hex;
  opener: Hex;
  erc6551Registry: Hex;
  containerImplementation: Hex;
  siteRegistry: Hex;
  acceptedSiteStoreImplementations: Hex[];
  domainBinding: Hex;
  acceptedDomainBindingImplementations: Hex[];
  processorCodeHash: Hex;
  proxyCodeHash: Hex;
  verifierCodeHash: Hex;
  runtimeRpcUrls: string[];
}

export interface VaultState {
  address: Hex;
  verifier: Hex;
  nft: Hex;
  tokenId: string;
  container: Hex;
  registry: Hex;
  binding: Hex;
  canonicalNameHash: Hex;
  publicKey: Hex;
  keyFingerprint: Hex;
  nonce: string;
  holder: Hex;
  deployed: boolean;
}

export interface SiteInspection {
  site: string;
  chainId: number;
  blockNumber: string;
  blockHash: Hex;
  profile: string;
  processor: Hex;
  processorNumber: number;
  tokenId: string;
  container: Hex;
  holder: Hex;
  opened: boolean;
  live: boolean;
  paidUntil: string | null;
  protection: ProtectionStatus;
  vault: VaultState | null;
  implementations: {
    siteRegistry: Hex;
    domainBinding: Hex;
  };
  warnings: string[];
}

export interface SiteFileInfo {
  path: string;
  size: number;
  contentType: string;
  sha256: Hex;
  updatedAt: string;
  chunkCount: number;
}

export interface ReleaseFile {
  path: string;
  size: number;
  sha256: Hex;
  chunks: number;
}

export interface ReleaseDiff {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
}

export interface PlannedCall {
  target: Hex;
  value: string;
  data: Hex;
  kind: "putFile" | "appendChunk" | "removeFile" | "setFallback" | "bind" | "setOperator" | "rotateKey" | "exit";
  path?: string;
}

export interface ReleaseLimits {
  maxFileBytes: number;
  maxSiteBytes: number;
  chunkBytes: number;
  maxCallsPerBatch: number;
  maxChunksPerFile: number;
  gasBudget: string;
}

export interface ReleaseBatch {
  index: number;
  calls: PlannedCall[];
  estimatedGas: string;
}

export interface ReleasePlan {
  schema: "qtape.releaseplan.v1";
  site: string;
  profile: string;
  chainId: number;
  vault: Hex;
  container: Hex;
  baseBlock: string;
  baseBlockHash: Hex;
  files: ReleaseFile[];
  manifestSha256: Hex;
  diff: ReleaseDiff;
  calls: PlannedCall[];
  batches: ReleaseBatch[];
  nonce: string;
  expiry: string;
  limits: ReleaseLimits;
  warnings: string[];
}

export interface PlanReleaseInput {
  site: string;
  files: readonly { path: string; content: Uint8Array }[];
  vault: string;
  profile?: string;
  rpcUrls?: string[];
  baseBlock?: string | bigint;
  nonce?: string | bigint;
  expiry?: string | bigint;
  limits?: Partial<ReleaseLimits>;
  prune?: boolean;
  fallbackPath?: string;
}

export interface Submission {
  digest: Hex;
  status: "submitted" | "confirmed" | "reverted" | "unknown";
  transactionHash: Hex | null;
  blockNumber: string | null;
  error: string | null;
}

export type SubmitTransport =
  | {
      type: "wallet";
      sendTransaction: (transaction: { to: Hex; data: Hex; value: string }) => Promise<Hex>;
      waitForReceipt?: (hash: Hex) => Promise<{ status: "success" | "reverted"; blockNumber: string }>;
    }
  | {
      type: "relayer";
      url: string;
      fetch?: typeof fetch;
    };

export interface SubmitSignedRequestInput {
  signedRequest: SignedRequestV1;
  expectedGuardian?: Hex;
  expectedChainId?: number;
}

export interface VerifiedFile {
  path: string;
  expectedSize: number;
  actualSize: number | null;
  expectedSha256: Hex;
  actualSha256: Hex | null;
  ok: boolean;
}

export interface VerificationResult {
  status: "VERIFIED" | "FAILED" | "RPC_DISAGREEMENT";
  blockNumber: string;
  blockHash: Hex;
  files: VerifiedFile[];
  errors: string[];
}

export interface VerifyReleaseInput {
  plan: ReleasePlan;
  rpcUrls: string[];
  blockNumber?: string | bigint;
}

export interface VaultPrepareInput {
  profile?: string;
  rpcUrls?: string[];
  deployer: Hex;
  deployerNonce: string | bigint;
  name: string;
  verifier: Hex;
  nft: Hex;
  tokenId: string | bigint;
  container: Hex;
  publicKey: Hex;
  keyChallenge: Hex;
  keyProof: Hex;
  artifact: { abi: readonly unknown[]; bytecode: Hex };
}

export interface PreparedVault {
  predictedAddress: Hex;
  constructorArgs: readonly [Hex, Hex, bigint, Hex, Hex, Hex, Hex, Hex, Hex, Hex];
  transaction: { chainId: number; to: null; data: Hex; value: "0"; expectedAddress: Hex };
}

export interface UnsignedTransaction {
  chainId: number;
  to: Hex;
  data: Hex;
  value: string;
}

export interface DepositPlan {
  vault: Hex;
  nft: Hex;
  tokenId: string;
  from: Hex;
  transaction: UnsignedTransaction;
}

export interface GuardianRequest {
  chainId: number;
  guardian: Hex;
  operation: 0 | 1 | 2;
  calls: CallV1[];
  nonce: string;
  expiry: string;
}
