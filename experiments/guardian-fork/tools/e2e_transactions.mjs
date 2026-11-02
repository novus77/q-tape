import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, encodeFunctionData, http, keccak256, parseAbi, sha256, stringToHex } from "viem"

// This tool is intentionally hard-wired to a local Anvil endpoint. Never point it at a public RPC.
const endpoint = "http://127.0.0.1:18545"
const chain = defineChain({ id: 196, name: "Local Q-Tape fork", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, rpcUrls: { default: { http: [endpoint] } } })
const client = createPublicClient({ chain, transport: http(endpoint) })
const clientVersion = await client.request({ method: "web3_clientVersion" })
if (!clientVersion.toLowerCase().includes("anvil") || await client.getBlockNumber({ cacheTime: 0 }) !== 74818827n) throw new Error("Requires the untouched local Anvil fork")
const accounts = await client.request({ method: "eth_accounts" })
const recipient = "0x000000000000000000000000000000000000bEEF"
if ((await client.getCode({ address: recipient })) !== undefined) throw new Error("Test recipient must have no code")
const transactionGasPrice = 20_000_001n + BigInt(Date.now() % 1_000_000)
const wallet = createWalletClient({ chain, account: accounts[0], transport: http(endpoint) })
const nft = "0x68f65046fdeab90d8db376c27b5e6ae159d240cc"
const container = "0xc0b4900262d0bc13f2c67c0fc4cf92c04e0ab814"
const registry = "0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6"
const binding = "0x68809fd2fb343aa57d0aeb7f33defe477c9666f9"
const nftAbi = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)", "function safeTransferFrom(address from, address to, uint256 tokenId)", "function transferFrom(address from, address to, uint256 tokenId)"])
const registryAbi = parseAbi(["function putFile(address container, string path, string contentType, bytes32 hash, bytes data)", "function read(address container, string path) view returns (bytes)"])
const owner = await client.readContract({ address: nft, abi: nftAbi, functionName: "ownerOf", args: [10n] })
const ownerWallet = createWalletClient({ chain, account: owner, transport: http(endpoint) })
const verifierArtifact = await Bun.file("out/FNDSAVerifier.sol/FNDSAVerifier.json").json()
const guardianArtifact = await Bun.file("out/GuardianLab.sol/GuardianLab.json").json()
const publicKey = (await Bun.file("fixtures/public-key.hex").text()).trim()
const receipts = []
const callType = { type: "tuple[]", components: [{ name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }] }
const snapshot = await client.request({ method: "evm_snapshot" })
let evidence

async function receipt(name, hash, status) {
  // JSON-RPC submission can return before Anvil's asynchronous miner stores its receipt.
  let raw
  for (let attempt = 0; attempt < 100; attempt++) {
    raw = await client.request({ method: "eth_getTransactionReceipt", params: [hash] })
    if (raw) break
    await Bun.sleep(100)
  }
  if (!raw) throw new Error(`${name}: local automined receipt unavailable`)
  const value = { status: raw.status === "0x1" ? "success" : "reverted", gasUsed: BigInt(raw.gasUsed), blockNumber: BigInt(raw.blockNumber), contractAddress: raw.contractAddress }
  receipts.push({ name, transactionHash: hash, status: value.status, gasUsed: String(value.gasUsed), blockNumber: String(value.blockNumber), contractAddress: value.contractAddress })
  if (value.status !== status) {
    const trace = await Promise.allSettled([client.request({ method: "debug_traceTransaction", params: [hash, { tracer: "callTracer" }] })])
    await Bun.write("results/e2e-failure.json", JSON.stringify({ name, receipts, trace: trace.map((item) => item.status === "fulfilled" ? item.value : { error: String(item.reason) }) }, (_, item) => typeof item === "bigint" ? String(item) : item, 2) + "\n")
    throw new Error(`${name}: expected ${status}, got ${value.status}; see results/e2e-failure.json`)
  }
  return value
}

function sign(account, operation, calls, nonce, expiry) {
  // Independent application encoder (viem), not a call to Guardian or Solidity test digest code.
  const callsHash = keccak256(encodeAbiParameters([callType], [calls]))
  const digest = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "uint8" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }], [keccak256(stringToHex("Q-Tape lab Guardian v1")), 196n, account, operation, callsHash, nonce, expiry]))
  const result = Bun.spawnSync(["bin/falcon-signer", "sign", "fixtures/test-secret-key.bin", digest], { stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr))
  return new TextDecoder().decode(result.stdout).trim()
}

try {
  const verifierReceipt = await receipt("deploy-real-verifier", await wallet.deployContract({ abi: verifierArtifact.abi, bytecode: verifierArtifact.bytecode.object, gas: 8_000_000n, gasPrice: transactionGasPrice }), "success")
  const guardianReceipt = await receipt("deploy-laboratory-guardian", await wallet.deployContract({ abi: guardianArtifact.abi, bytecode: guardianArtifact.bytecode.object, args: [verifierReceipt.contractAddress, nft, 10n, container, registry, binding, publicKey, "10.2.4.tape"], gas: 8_000_000n, gasPrice: transactionGasPrice }), "success")
  const guardian = guardianReceipt.contractAddress
  await client.request({ method: "anvil_impersonateAccount", params: [owner] })
  await client.request({ method: "anvil_setBalance", params: [owner, "0x56bc75e2d63100000"] })
  await receipt("move-nft-in-local-fork", await ownerWallet.writeContract({ address: nft, abi: nftAbi, functionName: "safeTransferFrom", args: [owner, guardian, 10n], gas: 500_000n, gasPrice: transactionGasPrice }), "success")
  const bytes = stringToHex("published with independent JavaScript ABI encoding")
  const calls = [{ target: registry, value: 0n, data: encodeFunctionData({ abi: registryAbi, functionName: "putFile", args: [container, "q-tape-lab/e2e.txt", "text/plain", sha256(bytes), bytes] }) }]
  const expiry = (await client.getBlock()).timestamp + 300n
  const signature = sign(guardian, 0, calls, 0n, expiry)
  const tampered = [{ ...calls[0], data: encodeFunctionData({ abi: registryAbi, functionName: "putFile", args: [container, "q-tape-lab/e2e.txt", "text/plain", sha256(stringToHex("attacker")), stringToHex("attacker")] }) }]
  await receipt("tampered-publication-rejected", await wallet.writeContract({ address: guardian, abi: guardianArtifact.abi, functionName: "execute", args: [0, tampered, 0n, expiry, signature], gas: 8_000_000n, gasPrice: transactionGasPrice }), "reverted")
  await receipt("valid-falcon-publication", await wallet.writeContract({ address: guardian, abi: guardianArtifact.abi, functionName: "execute", args: [0, calls, 0n, expiry, signature], gas: 8_000_000n, gasPrice: transactionGasPrice }), "success")
  const actualBytes = await client.readContract({ address: registry, abi: registryAbi, functionName: "read", args: [container, "q-tape-lab/e2e.txt"] })
  if (actualBytes !== bytes) throw new Error("Published bytes mismatch")
  await receipt("successful-request-replay-rejected", await wallet.writeContract({ address: guardian, abi: guardianArtifact.abi, functionName: "execute", args: [0, calls, 0n, expiry, signature], gas: 8_000_000n, gasPrice: transactionGasPrice }), "reverted")
  await receipt("old-owner-direct-nft-transfer-rejected", await ownerWallet.writeContract({ address: nft, abi: nftAbi, functionName: "transferFrom", args: [guardian, owner, 10n], gas: 500_000n, gasPrice: transactionGasPrice }), "reverted")
  if ((await client.readContract({ address: nft, abi: nftAbi, functionName: "ownerOf", args: [10n] })).toLowerCase() !== guardian.toLowerCase()) throw new Error("NFT left Guardian without PQ authorization")
  const transferCalls = [{ target: nft, value: 0n, data: encodeFunctionData({ abi: nftAbi, functionName: "safeTransferFrom", args: [guardian, recipient, 10n] }) }]
  const transferSignature = sign(guardian, 1, transferCalls, 1n, expiry)
  await receipt("valid-falcon-nft-transfer", await wallet.writeContract({ address: guardian, abi: guardianArtifact.abi, functionName: "execute", args: [1, transferCalls, 1n, expiry, transferSignature], gas: 8_000_000n, gasPrice: transactionGasPrice }), "success")
  const finalOwner = await client.readContract({ address: nft, abi: nftAbi, functionName: "ownerOf", args: [10n] })
  if (finalOwner.toLowerCase() !== recipient.toLowerCase()) throw new Error("Authorized transfer did not change holder")
  evidence = { observedAt: new Date().toISOString(), localAnvilOnly: true, endpoint, publicChainTransactionsBroadcast: 0, applicationEncoder: "viem JavaScript ABI encoding", perGuardianTransactionGasLimit: "8000000", localTransactionsBroadcast: receipts.length, byteReadBackMatches: true, receipts }
} catch (error) {
  await Bun.write("results/e2e-error.json", JSON.stringify({ observedAt: new Date().toISOString(), error: String(error), receipts }, null, 2) + "\n")
  throw error
} finally {
  await client.request({ method: "anvil_stopImpersonatingAccount", params: [owner] })
  await client.request({ method: "evm_mine" })
  const restored = await client.request({ method: "evm_revert", params: [snapshot] })
  if (!restored || BigInt(await client.request({ method: "eth_blockNumber" })) !== 74818827n) throw new Error("Local fork snapshot was not restored")
}
evidence.snapshotRestored = true
await Bun.write("results/e2e-transactions.json", JSON.stringify(evidence, null, 2) + "\n")
console.log(JSON.stringify({ localTransactions: receipts.length, publicTransactions: 0, snapshotRestored: true, operations: receipts.filter((value) => value.name.includes("publication") || value.name.includes("falcon-nft")).map((value) => ({ name: value.name, status: value.status, gasUsed: value.gasUsed })) }))
