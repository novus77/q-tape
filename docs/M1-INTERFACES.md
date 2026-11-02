# M1 模块接口约定

本文件是 M1 实施期间各 package 之间的实现契约，依据 [SPEC-v0.1](SPEC-v0.1.md) §7–§12。它不扩展协议能力，只把规范中的字节、ABI 和错误码固定为代码接口。若本文件与 Spec 冲突，以 Spec 为准并修正本文件。

## 依赖方向

```
schema  ->  protocol  ->  client  ->  cli
                         ^
signer  -----------------+（只依赖 schema/protocol）
relayer -> client/schema/protocol（不得依赖 signer）
web     -> client/schema/protocol（不得依赖 signer）
```

## 正式签名域

- 正式域：`Q-Tape Guardian v1`
- 实验域：`Q-Tape lab Guardian v1`（只存在于 `experiments/`，正式代码与测试必须相互拒绝）
- `domain = keccak256(bytes("Q-Tape Guardian v1"))`
- `callsHash = keccak256(abi.encode(Call[]))`，`Call = (address target, uint256 value, bytes data)`
- `digest = keccak256(abi.encode(domain, chainId, guardian, uint8(operation), callsHash, requestNonce, expiry))`
- Falcon 签名对 `digest` 的 32 个原始字节进行，不加 EIP-191 前缀。
- operation：`0 = EXECUTE`、`1 = EXIT`、`2 = ROTATE_KEY`。

## Request V1 / SignedRequest V1

```json
{
  "schema": "qtape.request.v1",
  "chainId": "196",
  "guardian": "0x...",
  "operation": 0,
  "calls": [{ "target": "0x...", "value": "0", "data": "0x..." }],
  "nonce": "0",
  "expiry": "2000000000"
}
```

- 所有 uint256 为无前导零的十进制字符串；`0` 自身合法。
- 地址为 20 字节 0x hex；`data` 为偶数长度 0x hex（`0x` 可为空）。
- 未知字段拒绝；`calls` 至少 1 项。

```json
{
  "request": { "...": "RequestV1" },
  "signature": "0x...",
  "digest": "0x..."
}
```

接收方必须重新计算 digest；`digest` 字段仅作展示/幂等 ID，不参与信任。

## KeyProof V1

- 消息：`abi.encode(keccak256(bytes("Q-Tape key possession v1")), chainId, vault, keccak256(publicKey), challenge)`
- 对 `keccak256(message)` 的 32 字节摘要签名。
- challenge 为独立的 32 字节随机值。
- 注册/换钥的 proof 必须由新公钥验证。
- ROTATE_KEY 的 `calls[0].data = abi.encode(bytes newKey, bytes32 challenge, bytes proof)`；`calls[0].target == vault`、`calls[0].value == 0`。

备份演练消息（不绑定 Vault）：

`keccak256(abi.encode(keccak256(bytes("Q-Tape backup check v1")), keccak256(publicKey), challenge))`

## Guardian constructor ABI

```solidity
constructor(
    address verifier,
    address nft,
    uint256 tokenId,
    address container,
    address registry,
    address binding,
    bytes32 canonicalNameHash,
    bytes initialPublicKey,
    bytes32 keyChallenge,
    bytes keyProof
)
```

构造器验证：

- verifier/NFT/Container/Registry/Binding 地址有代码；tokenId 对应 NFT 存在。
- `Container.owner() == NFT.ownerOf(tokenId)`（NFT 与 Container 的真实绑定关系）。
- `canonicalNameHash != 0`。
- Falcon-512 公钥为 897 字节且首字节 `0x09`；KeyProof 由该新公钥验证并绑定 `address(this)`。

## Guardian 对外 ABI

```solidity
struct Call { address target; uint256 value; bytes data; }

function execute(uint8 operation, Call[] calldata calls, uint256 requestNonce, uint256 expiry, bytes calldata signature) external payable;
function verifier() external view returns (address);
function nft() external view returns (address);
function tokenId() external view returns (uint256);
function container() external view returns (address);
function registry() external view returns (address);
function binding() external view returns (address);
function canonicalNameHash() external view returns (bytes32);
function publicKey() external view returns (bytes);
function keyFingerprint() external view returns (bytes32); // keccak256(publicKey)
function nonce() external view returns (uint256);

event Executed(uint8 indexed operation, uint256 indexed nonce, bytes32 callsHash);
event KeyRotated(bytes32 indexed oldFingerprint, bytes32 indexed newFingerprint, bytes32 challenge);
event Exited(address indexed to, uint256 indexed tokenId);
```

错误：`InvalidConfiguration`、`InvalidPublicKey`、`InvalidKeyProof`、`BadNonce`、`Expired`、`BadValue`、`BadOperation`、`DisallowedCall`、`NotHolder`、`InvalidSignature`、`Reentrancy`。

## KeyBundle V1

```json
{
  "schema": "qtape.keybundle.v1",
  "algorithm": "falcon-512-pqclean-round3-v1.2",
  "publicKey": "0x09...",
  "secretKey": "<base64 1281 bytes>",
  "createdAt": "2026-11-02T00:00:00.000Z"
}
```

- 整个 JSON 用 age v1 passphrase 格式加密；文件扩展名 `.age`。
- 解密后的 bundle 在内存中通过进程管道交给 native signer；不进入 argv/env/日志/临时文件。
- 公钥指纹：`keccak256(publicKey)`（hex）。

## Native signer 进程协议

`packages/signer/bin/qtape-falcon`（bootstrap 构建，git-ignored）：

- `keygen`：stdin 无输入，stdout 输出 `u32be publicKeyLen | publicKey | u32be secretKeyLen | secretKey`。
- `sign`：stdin 输入 `u32be secretKeyLen | secretKey | 32-byte digest`，stdout 输出 `u32be signatureLen | signature`；签名前用公钥自验。
- `verify`：stdin 输入 `u32be publicKeyLen | publicKey | u32be messageLen | message | u32be signatureLen | signature`，stdout 输出 `0x01` 或 `0x00`。

退出码：0 成功/已验证，2 输入无效或验签失败。任何模式都不从 argv 读取密钥。

## Client SDK 入口

```ts
inspectSite(input): Promise<SiteInspection>
planRelease(input): Promise<ReleasePlan>
submitSignedRequest(input, transport): Promise<Submission>
verifyRelease(input): Promise<VerificationResult>
```

普通钱包交易边界固定为 `{ chainId, to, data, value }`，客户端不得二次拼接另一份内容。

## CLI 错误码

`USAGE`、`CANCELLED`、`CHAIN_MISMATCH`、`UNSUPPORTED_PROFILE`、`CONFIG_CHANGED`、`NOT_TAPEOUT`、`NO_SUCH_TOKEN`、`NOT_OPENED`、`INVALID_REQUEST`、`INVALID_SIGNATURE`、`NONCE_CONFLICT`、`EXPIRED`、`SIMULATION_FAILED`、`BUDGET_EXCEEDED`、`BACKUP_VERIFICATION_FAILED`、`RPC_DISAGREEMENT`、`BROADCAST_UNKNOWN`、`FILE_INVALID`、`IO_ERROR`。成功 exit 0；校验/链/签名/权限错误 exit 1；用户取消 exit 2 且不记录成功。
