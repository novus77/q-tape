const endpoint = "http://127.0.0.1:18545"
const blockNumber = 74818827n
const block = `0x${blockNumber.toString(16)}`
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"

async function rpc(method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  const value = await response.json()
  if (value.error) throw new Error(JSON.stringify(value.error))
  return value.result
}

const metadata = await Promise.all([
  rpc("eth_chainId", []),
  rpc("eth_blockNumber", []),
  rpc("eth_getBlockByNumber", [block, false]),
])
if (BigInt(metadata[0]) !== 196n || BigInt(metadata[1]) !== blockNumber) throw new Error("Unexpected local fork")
const contracts = await Promise.all([
  ["siteRegistry", "0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6", true],
  ["domainBinding", "0x68809fd2fb343aa57d0aeb7f33defe477c9666f9", true],
  ["circuitNft", "0x68f65046fdeab90d8db376c27b5e6ae159d240cc", false],
  ["container", "0xc0b4900262d0bc13f2c67c0fc4cf92c04e0ab814", false],
].map(async ([role, address, proxy]) => {
  const code = await rpc("eth_getCode", [address, block])
  const implementation = proxy ? `0x${(await rpc("eth_getStorageAt", [address, implementationSlot, block])).slice(-40)}` : null
  const implementationCode = implementation ? await rpc("eth_getCode", [implementation, block]) : null
  return {
    role,
    address,
    codeBytes: (code.length - 2) / 2,
    codeSha256: Bun.CryptoHasher.hash("sha256", Buffer.from(code.slice(2), "hex"), "hex"),
    implementation,
    implementationCodeSha256: implementationCode ? Bun.CryptoHasher.hash("sha256", Buffer.from(implementationCode.slice(2), "hex"), "hex") : null,
  }
}))
const sourceFiles = [
  ["vendor/fndsa/FNDSA.sol", "2c8fb027bf7613993a271f9de113b2b3c1f1cb01"],
  ["vendor/fndsa/FNDSAKeccak.sol", "522e7a956c2869d935df6b0afdd576ca84ec0844"],
  ["vendor/fndsa/FNDSAVerifier.sol", "525534be0accc73f27e372c9fcda63012964a90f"],
]
const sources = await Promise.all(sourceFiles.map(async ([path, expectedGitBlob]) => {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer())
  const hasher = new Bun.CryptoHasher("sha1")
  hasher.update(`blob ${bytes.length}\0`)
  hasher.update(bytes)
  const actualGitBlob = hasher.digest("hex")
  if (actualGitBlob !== expectedGitBlob) throw new Error(`Pinned source mismatch: ${path}`)
  return { path, expectedGitBlob, actualGitBlob, matches: true }
}))
const owner = await rpc("eth_call", [{ to: "0x68f65046fdeab90d8db376c27b5e6ae159d240cc", data: `0x6352211e${"a".padStart(64, "0")}` }, block])
const beacons = await Promise.all([
  ["circuitBeacon", "0xf70d1ed4f62cf3780157b0b421b7e2f45bd0991c"],
  ["containerBeacon", "0x9b135f586f7850a3fa92210c298f732b20bc8f44"],
].map(async ([role, address]) => {
  const implementation = `0x${(await rpc("eth_call", [{ to: address, data: "0x5c60da1b" }, block])).slice(-40)}`
  const code = await rpc("eth_getCode", [implementation, block])
  return { role, address, implementation, implementationCodeSha256: Bun.CryptoHasher.hash("sha256", Buffer.from(code.slice(2), "hex"), "hex") }
}))
const evidence = {
  observedAt: new Date().toISOString(),
  experiment: "local-fork-only",
  publicChainTransactionsBroadcast: 0,
  chainId: 196,
  blockNumber: String(blockNumber),
  blockHash: metadata[2].hash,
  blockTimestamp: String(BigInt(metadata[2].timestamp)),
  localEndpoint: endpoint,
  originalOwnerAtLocalFork: `0x${owner.slice(-40)}`,
  contracts,
  beacons,
  sources,
  sourcePins: {
    fndsaSolidity: "54a14f251786686c41839c2f0cdb3655ea245ea3",
    verifierInterface: "6efa8e3eed3d89c301856e3fa8bb74b63eaa9f02",
    pqclean: "0586a824fc0d49df0b6b6e9179d8d15d06d0974f",
    forgeStd: "f3dae6e6ee381f25eb6a246f7da9b85c91a68219",
  },
  compiler: { version: "0.8.26", optimizerRuns: 200, viaIR: true, evm: "cancun" },
  exclusions: ["production security audit", "future external upgrades", "nonzero renewal fee", "TapeSend encrypted-message compatibility"],
}
await Bun.write("results/environment.json", JSON.stringify(evidence, null, 2) + "\n")
console.log(JSON.stringify({ environment: "captured", block: evidence.blockNumber, blockHash: evidence.blockHash, sourcePinsVerified: sources.length }))
