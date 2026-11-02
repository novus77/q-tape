import {
  QtapeClientError,
  assertDigestMatches,
  createProvider,
  encodeExecuteData,
  simulateSignedRequest,
  totalCallValue,
} from "@qtape/client";
import { guardianAbi } from "@qtape/client";
import type { SignedRequestV1 } from "@qtape/schema";
import { createWalletClient, http, type Hex, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RelayError } from "./errors.js";

export interface RelayPolicy {
  maxGas: bigint;
  maxValue: bigint;
  allowedGuardians?: Hex[];
}

export interface SimulationSummary {
  gasEstimate: bigint;
  value: bigint;
}

export interface RelayChain {
  chainId(): number;
  health(): Promise<{ blockNumber: string }>;
  validateAndSimulate(signed: SignedRequestV1): Promise<SimulationSummary>;
  submit(signed: SignedRequestV1, simulation: SimulationSummary): Promise<{ transactionHash: Hex }>;
  receipt(transactionHash: Hex): Promise<{ status: "pending" | "success" | "reverted"; blockNumber?: string }>;
}

export interface ViemRelayChainOptions extends RelayPolicy {
  rpcUrl: string;
  secondaryRpcUrl?: string;
  chainId: number;
  privateKey: Hex;
}

export class ViemRelayChain implements RelayChain {
  private readonly provider;
  private readonly secondaryProvider;
  private readonly wallet: WalletClient;
  private readonly policy: RelayPolicy;
  private readonly expectedChainId: number;

  constructor(options: ViemRelayChainOptions) {
    this.provider = createProvider(options.rpcUrl, options.chainId);
    this.secondaryProvider = options.secondaryRpcUrl
      ? createProvider(options.secondaryRpcUrl, options.chainId)
      : null;
    this.expectedChainId = options.chainId;
    this.policy = options;
    const account = privateKeyToAccount(options.privateKey);
    this.wallet = createWalletClient({ account, chain: this.provider.client.chain, transport: http(options.rpcUrl) });
  }

  chainId(): number {
    return this.expectedChainId;
  }

  private async agreeOnBlock(): Promise<bigint> {
    const primaryHead = await this.provider.client.getBlockNumber();
    if (!this.secondaryProvider) return primaryHead;
    const secondaryHead = await this.secondaryProvider.client.getBlockNumber();
    const blockNumber = primaryHead < secondaryHead ? primaryHead : secondaryHead;
    const [primaryBlock, secondaryBlock] = await Promise.all([
      this.provider.client.getBlock({ blockNumber }),
      this.secondaryProvider.client.getBlock({ blockNumber }),
    ]);
    if (primaryBlock.hash !== secondaryBlock.hash) {
      throw new RelayError("RPC_DISAGREEMENT", `relayer RPC operators disagree at block ${blockNumber}`, 503);
    }
    return blockNumber;
  }

  async health(): Promise<{ blockNumber: string }> {
    return { blockNumber: (await this.provider.client.getBlockNumber()).toString() };
  }

  async validateAndSimulate(signed: SignedRequestV1): Promise<SimulationSummary> {
    assertDigestMatches(signed);
    const request = signed.request;
    if (BigInt(request.chainId) !== BigInt(this.expectedChainId)) {
      throw new RelayError("UNSUPPORTED_PROFILE", `request chain ${request.chainId} is not served by this relayer`, 422);
    }
    if (this.policy.allowedGuardians && !this.policy.allowedGuardians.map((value) => value.toLowerCase()).includes(request.guardian.toLowerCase())) {
      throw new RelayError("UNSUPPORTED_PROFILE", "guardian is not in the relayer allowlist", 422);
    }
    const blockNumber = await this.agreeOnBlock();
    const [code, nonce, block] = await Promise.all([
      this.provider.client.getCode({ address: request.guardian, blockNumber }),
      this.provider.client.readContract({ address: request.guardian, abi: guardianAbi, functionName: "nonce", blockNumber }),
      this.provider.client.getBlock({ blockNumber }),
    ]);
    if (!code || code === "0x") throw new RelayError("INVALID_REQUEST", "guardian has no code", 400);
    if (this.secondaryProvider) {
      const [secondaryCode, secondaryNonce, secondaryBlock] = await Promise.all([
        this.secondaryProvider.client.getCode({ address: request.guardian, blockNumber }),
        this.secondaryProvider.client.readContract({ address: request.guardian, abi: guardianAbi, functionName: "nonce", blockNumber }),
        this.secondaryProvider.client.getBlock({ blockNumber }),
      ]);
      if (code !== secondaryCode || nonce !== secondaryNonce || block.hash !== secondaryBlock.hash) {
        throw new RelayError("RPC_DISAGREEMENT", `relayer RPC operators disagree at block ${blockNumber}`, 503);
      }
    }
    if (nonce !== BigInt(request.nonce)) {
      throw new RelayError("NONCE_CONFLICT", `request nonce ${request.nonce} does not match on-chain nonce ${nonce}`, 409);
    }
    if (block.timestamp > BigInt(request.expiry)) {
      throw new RelayError("EXPIRED", "request expiry has passed", 422);
    }
    const value = totalCallValue(signed);
    if (value > this.policy.maxValue) {
      throw new RelayError("BUDGET_EXCEEDED", `request value ${value} exceeds relayer policy ${this.policy.maxValue}`, 422);
    }
    let simulation;
    try {
      simulation = await simulateSignedRequest({
        signedRequest: signed,
        rpcUrl: this.provider.url,
        chainId: this.expectedChainId,
        from: this.wallet.account?.address,
        gasBudget: this.policy.maxGas,
      });
    } catch (error) {
      if (error instanceof QtapeClientError && error.code === "BUDGET_EXCEEDED") {
        throw new RelayError("BUDGET_EXCEEDED", error.message, 422);
      }
      throw new RelayError("SIMULATION_FAILED", error instanceof Error ? error.message : String(error), 422);
    }
    if (!simulation.withinBudget) {
      throw new RelayError("BUDGET_EXCEEDED", `estimated gas ${simulation.gasEstimate} exceeds ${this.policy.maxGas}`, 422);
    }
    return { gasEstimate: BigInt(simulation.gasEstimate), value };
  }

  async submit(signed: SignedRequestV1, simulation: SimulationSummary): Promise<{ transactionHash: Hex }> {
    const transactionHash = await this.wallet.sendTransaction({
      account: this.wallet.account!,
      chain: this.wallet.chain,
      to: signed.request.guardian,
      data: encodeExecuteData(signed),
      value: simulation.value,
      gas: (simulation.gasEstimate * 110n) / 100n,
    });
    return { transactionHash };
  }

  async receipt(transactionHash: Hex): Promise<{ status: "pending" | "success" | "reverted"; blockNumber?: string }> {
    const receipt = await this.provider.client.getTransactionReceipt({ hash: transactionHash }).catch(() => null);
    if (!receipt) return { status: "pending" };
    return { status: receipt.status === "success" ? "success" : "reverted", blockNumber: receipt.blockNumber.toString() };
  }
}
