import { parseAbi } from "viem";

export const guardianAbi = parseAbi([
  "constructor(address verifier, address nft, uint256 tokenId, address container, address registry, address binding, bytes32 canonicalNameHash, bytes initialPublicKey, bytes32 keyChallenge, bytes keyProof)",
  "function execute(uint8 operation, (address target, uint256 value, bytes data)[] calls, uint256 requestNonce, uint256 expiry, bytes signature) payable",
  "function verifier() view returns (address)",
  "function nft() view returns (address)",
  "function tokenId() view returns (uint256)",
  "function container() view returns (address)",
  "function registry() view returns (address)",
  "function binding() view returns (address)",
  "function canonicalNameHash() view returns (bytes32)",
  "function publicKey() view returns (bytes)",
  "function keyFingerprint() view returns (bytes32)",
  "function nonce() view returns (uint256)",
  "event Executed(uint8 indexed operation, uint256 indexed nonce, bytes32 callsHash)",
  "event KeyRotated(bytes32 indexed oldFingerprint, bytes32 indexed newFingerprint, bytes32 challenge)",
  "event Exited(address indexed to, uint256 indexed tokenId)",
]);

export const registryAbi = parseAbi([
  "function fileInfo(address container, string path) view returns (uint32 size, string contentType, bytes32 sha256Hash, uint40 updatedAt, uint256 chunkCount)",
  "function read(address container, string path) view returns (bytes)",
  "function readRange(address container, string path, uint256 offset, uint256 len) view returns (bytes)",
  "function pathCount(address container) view returns (uint256)",
  "function pathsRange(address container, uint256 from, uint256 n) view returns (string[])",
  "function paths(address container) view returns (string[])",
  "function fallbackPath(address container) view returns (string)",
  "function isOpenedContainer(address container) view returns (bool)",
  "function putFile(address container, string path, string contentType, bytes32 sha256Hash, bytes data)",
  "function appendChunk(address container, string path, uint256 expectIndex, bytes data)",
  "function removeFile(address container, string path)",
  "function setFallback(address container, string path)",
  "function setOperator(address container, address op, uint256 ttl)",
]);

export const bindingAbi = parseAbi([
  "function isLive(string name, address container) view returns (bool)",
  "function isContainerLive(address container) view returns (bool)",
  "function paidUntil(bytes32 nameHash, address container) view returns (uint40)",
  "function containerPaidUntil(address container) view returns (uint40)",
  "function monthlyFee() view returns (uint256)",
  "function bind(string name, address container, uint256 months) payable",
  "function syncContainer(string name, address container)",
  "function unbind(string name, address container)",
]);

export const factoryAbi = parseAbi([
  "function cpuCount() view returns (uint256)",
  "function cpuAt(uint256 i) view returns (address)",
  "function isCPU(address candidate) view returns (bool)",
]);

export const openerAbi = parseAbi([
  "function accountOf(address circuits, uint256 tokenId) view returns (address)",
  "function isOpened(address circuits, uint256 tokenId) view returns (bool)",
]);

export const containerAbi = parseAbi([
  "function owner() view returns (address)",
  "function token() view returns (uint256 chainId, address tokenContract, uint256 tokenId)",
]);

export const nftAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
]);
