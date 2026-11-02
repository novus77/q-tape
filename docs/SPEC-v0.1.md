# Q-Tape Spec 开发文档 v0.1

版本：0.1 Draft。日期：2026-11-02。默认分支：`dev`。本文定义待开发 MVP；已完成能力仅限明确列出的 PoC。文中的 MUST/必须为开发验收要求，不意味着当前代码已经实现。

## 1. 产品定义

Q-Tape 是 TapeOut 生态中面向 DeWEB 网站发布权限的后量子保护层。首个产品为 **Q-Tape Vault**：由独立 Falcon 密钥控制、持有一枚 circuit NFT 的合约保险箱。

目标用户：项目官网/文档站维护者、需要审批发布的团队、希望为用户提供受约束发布能力的工具开发者。

目标效果：在明确的外部协议假设下，旧 ECDSA 钱包私钥或发布服务被攻破，不足以单独修改受保护站点或转走指定 NFT。用户自己持有 Falcon 密钥，项目方不持有绕过验签的权限。

第一版同时具有独立使用闭环，并定义可供 TapeCI、HashPort 等工具接入的 SDK。集成尚未完成，不以合作方身份宣传。

## 2. 当前事实与目标的分界

| 能力 | 当前状态 | 依据或交付要求 |
|---|---|---|
| 合约 holder 写文件、删除、fallback、续期 | 已在固定 fork 验证 | X Layer 74818827，6 项协议测试 |
| 所测旧 owner/operator 与 NFT 批准者失效 | 已在固定 fork 验证 | 每个所测入口实际被拒；非全量历史权限证明 |
| 真实 Falcon 授权与攻击负例 | 已验证 PoC | 15 项 Guardian 测试，非 mock verifier |
| 独立 JavaScript 编码的发布/转出 | 已验证 PoC | 5 个完整本地交易行为用例，公网广播为 0 |
| 产品 Vault、生产密钥管理、产品 CLI、relayer、Web | 待开发 | 本文 M1 验收 |
| 非零月费、其他部署版本、全部历史授权 | 未验证 | 对应能力不得默认开启 |
| TapeSend 加密收信、浏览器 Falcon、多签恢复 | 不在首发 | 需额外协议/产品工作 |
| 主网发行、安全审计、最终 FN-DSA 兼容 | 未完成 | 不对外宣称已完成 |

原始证据见 [验证报告](VERIFICATION.md) 与 [历史结果](../evidence/2026-11-02/README.md)。实验合约 `GuardianLab` 不能仅改名成为正式 Vault。

## 3. 底层分工与边界

| 层 | 角色 |
|---|---|
| X Layer / BNB Chain / Base | 链上代码、状态、历史与事件的底层；MVP 只实现 X Layer 适配 |
| TapeOut 电路协议 | circuit NFT、Processor、电路与账户基础 |
| Container | 绑定 circuit 的 ERC-6551 身份和文件命名空间 |
| DeWEB | 网站访问与消息通信层 |
| SiteRegistry + 文件块合约 | 文件读写接口、索引、元信息与原始文件字节 |
| DomainBinding | 网站激活与续费记录 |
| TapeKit / shell | 读取、校验、隔离、显示 |
| Q-Tape | NFT 控制权、Falcon 授权、受约束执行和发布验收 |

Q-Tape 不创建新存储网络，不使文件变成不可更新，也不改变底层链的签名或共识。SHA-256 校验说明字节与记录一致，不说明内容无恶意。

保护范围针对接入后的旧 ECDSA 私钥泄露、发布服务/relayer 被攻破、请求篡改和重放。Falcon 私钥或签名主机被攻破、用户主动批准恶意内容、外部协议管理员与底层链失陷不在本版保证范围；双 RPC 一致也不是对整条链的后量子安全证明。

## 4. 首发范围

### 必须交付

- 一个 Vault 对应一个确定的 NFT 合约、tokenId 和 Container。
- 从首笔管理操作起采用 PQ-only 权限；没有长期经典 owner 管理入口。
- 文件批次发布、删除、fallback、激活/续期、仅撤销 operator、公钥轮换、NFT 退出。
- 本地 Falcon signer 与独立加密备份；备份恢复演练后才允许提交 NFT 迁移。
- CLI 的检查、规划、签名、提交、核验闭环。
- 公共请求协议与 client SDK；signer 与 client 分离。
- 用户可自行广播；可选 relayer 只接收签名请求，不接收密钥。
- 简单 Web：保护状态与证据展示；连接普通钱包只用于空 Vault 部署/NFT 迁入等持有者操作，不在浏览器导入 Falcon 私钥。

### 首发排除

普通 EOA operator 的持续发布授权、任意目标调用、`delegatecall`、通用 `container.execute`、代币资金池、浏览器 Falcon 签名、PQ 身份网络、ML-KEM 消息产品、QPU 随机数、跨链钱包、社交恢复、代币/预售。

MVP 优先支持专用发布 circuit。兼任原生 TapeSend 加密收信身份的站点默认拒绝自动迁移：当前消息合约的公钥规则不能假定支持常规合约 holder。

## 5. 两种用户流程

### 5.1 独立使用

1. 用户用已有构建工具生成静态文件，Q-Tape 不承担通用网站构建服务。
2. `inspect` 解析名字、NFT、Container、开通/激活状态和协议实现；发现未支持配置则停止。
3. 本地生成独立 Falcon 密钥，导出加密备份，恢复备份并完成公钥/挑战签名核对。
4. 准备并检查空 Vault 部署交易；用户用自己的普通钱包提交。确认部署代码、公钥指纹与固定参数一致。
5. 准备 NFT 迁入交易；展示保护范围、TapeSend 兼容性和退出后果，由用户钱包确认。
6. NFT 已迁入仅进入待核验状态；确认部署 profile 与旧授权处理满足策略后，才显示保护生效。
7. CLI 比对文件变化，显示新增/修改/删除、费用预算和待签批次；用户批准后本地签名。
8. 用户自行广播或选 relayer，逐批确认结果；完成后按同一区块双运营方回读校验，再标记发布已核验。

空 Vault 部署、NFT 迁入使用普通钱包不构成保护后的经典管理入口。创建与迁入都必须向用户展示完整链、目标、资产与数额。

### 5.2 发布工具集成

`工具构建 -> 调用 SDK 生成 ReleasePlan -> 本地 signer 审核与签名 -> 工具/relayer 提交 -> SDK 回读验收`。

集成方不得把 Falcon 私钥放进 CI，不得先获得可任意发布的 EOA operator，再声称严格保护。SDK 不提供“跳过验签”模式。已有工具必须调整实际调用路径，不能只加徽章或钱包连接按钮。

站点读取机制不变；TapeKit 无需为获取原始文件而依赖 Q-Tape 服务。Q-Tape 状态展示属于可选集成。

## 6. 架构与计划模块

以下路径是 MVP 的计划目录，当前仓库没有声称它们已实现：

| 模块 | 计划路径 | 职责 |
|---|---|---|
| Schema | `packages/schema` | 外部 JSON/配置验证、十进制 uint 与 hex 类型 |
| Protocol | `packages/protocol` | 请求编码、摘要、manifest、操作枚举；纯逻辑 |
| Contracts | `contracts` | 正式 Vault、固定 verifier 接口、事件与约束 |
| Client / SDK | `packages/client` | 站点发现、读链、规划、模拟、提交、回读 |
| Signer | `packages/signer` | 本地密钥、加密备份、native signer 协议 |
| CLI | `packages/cli` | 组合 SDK 与本地 signer，用户交互和执行日志 |
| Relayer | `apps/relayer` | 校验签名请求、服务费用策略、广播与收据追踪 |
| Web | `apps/web` | 普通钱包接入、只读状态、发布证据；无 Falcon 私钥 |

运行时依赖方向：Schema -> Protocol；Client 可用 Schema/Protocol，不依赖 relayer/server；Signer 只用 Schema/Protocol 和本地密码学适配；CLI 组合 Client/Signer；Relayer/Web 使用 Client。不能让 client SDK 引入服务端代码或本地私钥处理。

当前实际实现仅在 `experiments/guardian-fork`，与正式产品目录隔离。

## 7. Vault 合约要求

### 7.1 初始化与存储

固定参数：verifier、NFT 合约、tokenId、Container、SiteRegistry、DomainBinding、规范名字哈希。可变状态：Falcon 公钥、单调 nonce。verifier 与 Vault 不留经典管理员可修改的代理路径。

部署工具先核对官方配置、NFT/Container 的真实关联与代码。正式 Vault 构造器必须检查基本配置有效性；不能照搬实验合约对任意初始化参数的信任。详细真实性校验与 gas 成本在 M1 合约任务中落地，并由测试证明。

MVP 采用用户普通钱包的直接 CREATE 部署，不先引入可升级 factory 或 CREATE2 工厂。prepare 根据该钱包的部署 nonce 预测 Vault 地址，供 KeyProof 绑定；签名前重读 nonce，改变则重新规划和签名。部署收据与初始化参数核对完成前不生成可直接执行的 NFT 迁入步骤。

Falcon-512 公钥采用固定 profile 的 897 字节编码。单靠长度/header 不能称作完整合法公钥验证；注册与换钥必须配合新钥持有证明和批准版本的解码规则。proof 的具体挑战编码是 M1 签名协议的一部分，见 9.2。

### 7.2 操作与允许范围

| operation | 名称 | 允许范围 |
|---|---|---|
| 0 | EXECUTE | 指定 Registry 的文件入口、仅撤销 operator、指定 Binding 的规范名字续期 |
| 1 | EXIT | 一次明确的指定 NFT `safeTransferFrom(Vault,to,tokenId)`；默认只用三参数安全转移 |
| 2 | ROTATE_KEY | 新公钥与持有证明；旧钥授权，成功消耗 nonce |

EXECUTE 允许 `putFile/appendChunk/removeFile/setFallback`，且 calldata 内 Container 必须是绑定账户；Registry 调用 value 必须为 0。`setOperator` 仅允许 TTL=0，不能接受调用者提供的非零 TTL。Binding 调用必须匹配规范名字和 Container；金额在签名中，由调用者提供且准确转发。

EXIT 不允许批准第三方、改变 tokenId 或借通用调用转出其他资产。有效 Falcon 签名不保证接收账户符合 ERC-721 接收规则；包括 EIP-7702 在内的有代码接收者必须先模拟。退出后原 Vault 的保护结束。

不得存在管理员提取 NFT、`approve/setApprovalForAll`、经典恢复、可随意换 verifier、任意目标执行等绕过入口。

### 7.3 执行与失败

校验请求 nonce/expiry/value，重新计算摘要并验 Falcon，核对指定 NFT 仍由 Vault 持有，在外部调用前消耗 nonce，再执行白名单调用。批次中任一调用失败，全部效果与 nonce 消费一同回滚。

客户端可以对未成功请求重试；不得把成功请求换 nonce 再执行一遍。换 relayer 提交尚未消费的同一请求是正常广播，不是攻击。

生产合约的重入、异常回滚和升级外部依赖行为须由测试与审查明确覆盖；实验中 nonce 先消费并不等价于已经完成完整安全审计。

## 8. 签名与请求协议

### 8.1 算法版本

v0.1 目标为固定 **Falcon round-3 v1.2 / PQClean 字节格式**。`0x0301` 是所用 verifier 接口的算法 ID，不能据此声称已经符合最终 FIPS 206。

签名器必须与固定 verifier 的参考向量、随机消息和交叉语言编码互操作。默认使用参考实现的压缩签名；如接受 padded 格式，必须有独立明确测试，不能在传输时擅自补零。

### 8.2 Call 与摘要

```solidity
struct Call {
    address target;
    uint256 value;
    bytes data;
}

callsHash = keccak256(abi.encode(calls));
domain = keccak256(bytes("Q-Tape Guardian v1"));
digest = keccak256(abi.encode(
    domain,
    chainId,
    guardian,
    uint8(operation),
    callsHash,
    requestNonce,
    expiry
));
```

Falcon 签署 `digest` 的 **32 个原始字节**。不签十六进制字符串的 UTF-8，不加 EIP-191 personal-sign 前缀，不用 ECDSA typed-data 签名替代。

链 ID、金额、nonce、expiry 为 uint256；expiry 是链上 Unix 秒，`block.timestamp > expiry` 拒绝。数组顺序参与编码；nonce 从 0 单调递增。

**兼容性区别：** 现有 PoC 使用 `Q-Tape lab Guardian v1`，正式目标域为 `Q-Tape Guardian v1`。二者必须相互拒绝，不把实验签名直接导入产品。M1 必须提交 Solidity/TypeScript 双实现固定向量。

### 8.3 JSON 传输

Request V1 字段：`schema="qtape.request.v1"`、`chainId`、`guardian`、`operation`、`calls[]`、`nonce`、`expiry`。operation 使用数值 0/1/2；所有 uint256 在 JSON 中使用无多余前导零的十进制字符串。地址规范化后按 20 字节编码；data 使用偶数长度的 0x hex。

SignedRequest V1 包含原 request、signature 和 digest。接收方必须重新计算 digest，不信任传入值；本地公钥指纹与期望 Vault 公钥不一致时停止。请求里不能携带私钥、备份口令或未签名的执行覆盖参数。

外部 JSON 在 Schema 层验证一次，内部模块接收类型化值。生产 profile 固定算法，不能通过 JSON 指定另一个 verifier。

## 9. 本地密钥与备份

### 9.1 独立性

Falcon 密钥必须来自独立本地随机性，不能由旧 ECDSA 私钥、公开钱包签名或可由旧私钥重建的材料派生。项目服务器、CI 和 relayer 不能参与持有完整私钥。

现有 C 工具读取未加密的本地测试文件，仅用于实验，不作为产品密钥存储方案。

MVP 采用现成 age v1 passphrase 文件格式封装版本化 key bundle；锁定具体受支持工具版本后再实现。必须使用独立口令的 passphrase 模式，不能用旧钱包密钥代替，也不能把“age 支持某种接收者格式”当作该格式的后量子保证。native signer 通过进程管道接收解密数据，不在 argv/env、日志或临时文件中暴露明文。

解密后的 bundle 使用 `schema="qtape.keybundle.v1"`、固定 algorithm profile、publicKey（0x hex）、secretKey（base64）、createdAt（UTC ISO 8601）。整个 bundle 在 age 认证加密内部；外部显示的文件名或公钥指纹不能代替解密后的核对。原生进程接口要支持 stdin/fd 输入，不复用当前实验工具的明文文件接口作为产品默认路径。

### 9.2 持有证明与恢复演练

KeyProof V1 的原始消息为 `abi.encode(keccak256(bytes("Q-Tape key possession v1")), chainId, vault, keccak256(publicKey), challenge)`；对其 keccak256 的 32 字节摘要签名。challenge 是本地生成的独立随机 bytes32。

注册/换钥所需 proof 必须由新公钥验证；ROTATE_KEY 的 calls.data 编码 `(bytes newKey, bytes32 challenge, bytes proof)`，外层请求仍需旧钥授权。外层 nonce 限制该次变更；proof 不是可执行授权。

首次接入前，用户必须从独立的加密备份恢复 key bundle 并核对公钥指纹。尚未 prepare Vault 时，备份演练签署 `keccak256(abi.encode(keccak256(bytes("Q-Tape backup check v1")), keccak256(publicKey), challenge))` 的 32 字节；它不是登记或换钥授权。prepare 确定部署地址后，再完成绑定该地址的 KeyProof。备份口令错误、损坏或恢复失败时，不进入 NFT 迁入流程。丢钥后没有经典私钥兜底；MVP 不承诺社交恢复。

## 10. 发布规划、费用与一致性

ReleasePlan V1 包含：artifact 文件列表及原始字节 SHA-256、目标站点/profile、基准区块、diff、完整有序调用、批次划分和预算。固定产物在批准后不得由 CI 重新构建替换。

Registry 单块上限 24,000 字节、最多 350 块，不等于加入 Falcon 后一笔交易总能放满该上限。初版建议预算值：单文件 <= 1 MiB、整站 <= 5 MiB、候选块 12,000 字节、每批最多 16 调用、单笔默认预算 8,000,000 gas。它们是**待实现并验证的产品限制**，不是原生协议上限或已测性能承诺。

规划器使用已验证 gas profile 生成候选批次；最终签名后，对确切 calldata 进行模拟和 gas 估算。超预算则回到规划并重新批准/签名；relayer 不能自行拆分、重排或更换已签请求。单个候选调用仍超预算时，缩小文件块并重算完整计划。必须同时验证文件的块数限制；不能无限拆块。

只处理构建根目录内的普通文件，不跟随外部符号链接；拒绝路径逃逸，保留明确的新增/修改/删除列表。路径规范和实际签名字节必须一致，不能仅在 UI 中显示规范化路径。

多批次不承诺整站原子切换。建议先写版本化资源，最后更新入口；这只能降低中间态风险。每批使用链上当前 nonce，临近提交再签名，默认请求有效期 300 秒，显示实际 expiry。续期费用从当前链读取并纳入签名，变化后不得悄悄多扣。

## 11. SDK 与 CLI 接口目标

以下是待实现接口，不是当前可执行命令。

SDK：

```ts
inspectSite(input): Promise<SiteInspection>
planRelease(input): Promise<ReleasePlan>
encodeRequest(input): { callsHash, digest }
submitSignedRequest(input, transport): Promise<Submission>
verifyRelease(input): Promise<VerificationResult>
```

Signer 单独提供 `signDigest(digest, keyRef)` 和 key bundle/KeyProof 操作；Client SDK 不自动加载私钥。

CLI 目标命令：

| 命令 | 作用 |
|---|---|
| `qtape inspect <site>` | 检查身份、权限范围、激活和实现 |
| `qtape key create` / `key verify-backup` | 本地生成与备份演练 |
| `qtape vault prepare` | 输出空 Vault 部署计划和未签名交易 |
| `qtape vault deposit` | 输出指定 NFT 迁入交易，由普通钱包确认 |
| `qtape release plan <dir>` | 生成固定产物与调用批次 |
| `qtape request sign <request>` | 审核后用本地 signer 签名 |
| `qtape request submit <signed>` | 指定 relayer 或用户自选交易发送器 |
| `qtape release verify <plan>` | 链上回读验收 |
| `qtape operator revoke` | 仅 TTL=0 的撤销 |
| `qtape key rotate` / `vault exit` | 明确授权的换钥/转出 |

`--json` 输出版本化机器结果；成功命令 exit 0，校验/链/签名/权限错误使用稳定错误码。用户取消不会记录成成功。普通钱包提交接口以 `{chainId,to,data,value}` 为边界，前端不得重新拼接另一份内容。

## 12. Relayer、幂等与异常恢复

计划接口：`POST /v1/requests`、`GET /v1/requests/:digest`、`GET /health`。POST 只接受 SignedRequest V1；服务端验证 schema、domain、nonce、expiry、Vault 配置、完整调用和预算，再模拟后提交。

digest 是幂等请求 ID。相同请求重复提交返回原状态/交易信息；禁止为了重试自动修改 nonce 或生成另一份发布。状态为 `received -> simulated -> submitted -> confirmed`，也可为 `reverted/expired/unknown`。202 只表示接收或提交，不表示发布已验证。

错误至少包含 `INVALID_REQUEST`、`INVALID_SIGNATURE`、`NONCE_CONFLICT`、`EXPIRED`、`UNSUPPORTED_PROFILE`、`RPC_DISAGREEMENT`、`SIMULATION_FAILED`、`BUDGET_EXCEEDED`。链状态与本地日志冲突时先核对 nonce、收据与实际文件，不盲目重发。

relayer 只资助其愿意接受的 gas/value，用户可换服务或自行提交同一有效请求。停止订阅/服务不能取得 NFT，也不能阻断用户自主执行。服务定价属于后续验证，MVP 不预设年费模型已成立。

## 13. 状态、核验与外部协议变化

保护状态：`UNPROTECTED`、`VAULT_PREPARED`、`DEPOSITED_UNVERIFIED`、`PROTECTED`、`CONFIG_CHANGED`、`EXITED`、`UNSUPPORTED`。

PROTECTED 必须附链、Vault、NFT/Container、实现 profile、授权核验范围与观察区块。未核实历史授权、消息兼容性不明或 profile 未支持时，不显示无范围的安全徽章。

发布状态独立：`PLANNED/SIGNED/SUBMITTED/CONFIRMED/VERIFIED/FAILED/UNKNOWN`。VERIFIED 要求同一区块、至少两家独立运营方一致读回文件长度、原始字节 SHA-256 和目标 manifest；不能只看交易成功事件。

客户端从 RPC 读取 ERC-1967 实现槽及有关 beacon/代码指纹，发现不匹配默认停止规划和提交。不得调用可被新实现伪造的 `implementation()` 来代替槽核对。

**边界：** 普通合约不能直接 SLOAD 另一代理的实现槽；仅固定 proxy 地址或 proxy codehash 不能阻止恶意升级。客户端监控和停止服务不等于链上阻止外部管理员改写 Registry。保护声明必须保留外部协议假设。

## 14. 测试与验收

| 类别 | MVP 验收 |
|---|---|
| 真实协议 | 保留现有 21 项；对新增 profile 固定区块复测 holder/旧权限 |
| 密码学互操作 | Solidity/TypeScript/native signer 的独立固定向量；错误格式/公钥/摘要拒绝 |
| 调用与域 | 字段逐项篡改、批次重排、跨链/Vault/域重放、有效期边界 |
| 管理出口 | 换钥证明、旧钥失效、错误接收者、不得创建 operator/NFT approval |
| 失败恢复 | 批次回滚、nonce 恢复、提交超时/结果未知、重试不双发 |
| 文件 | 空/多块文件、路径逃逸、产物改变、超文件/块数/gas预算 |
| 续期 | 零费、非零费、费用变化、上限与付费不足；明确真实协议 vs fixture |
| 生命周期 | 本地生成、错误口令、备份恢复、准备、迁入、保护核验、发布、换钥、退出 |
| 独立集成 | 不依赖其他发布平台完成闭环；一个适配器遵循同一 SDK 请求协议 |

官方测试网部署尚未确认：真实协议集成始终可在主网 fork 验证；自部署测试 NFT/Registry 必须标为 fixture，不能写成官方协议兼容已证明。没有安全审查与明确资产/费用授权，不进入真实用户 NFT 迁移。

## 15. 阶段与发布标准

- **M0 已完成：** 固定 fork 可行性 PoC、21 项测试、独立应用端本地交易证据。
- **M1 下一阶段：** 正式合约/协议、native signer 与备份、CLI/SDK、可替换广播、简单钱包接入/状态界面；补全关键未测项。
- **M2：** 设计合作用户试用、独立安全审查、一个真实发布工具适配；修正 UX 和恢复问题。
- **M3：** 明确批准后小范围主网专用站点试点；监控、费用策略和应急流程验收。

不提前承诺四周主网上线。ID、消息、量子随机数、跨链与 PQ 多签不挤入 M1。

## 16. 本版优化决策与来源

1. 独立产品先能用，集成走公开协议；不做某个发布工具的内部插件。
2. 接入后 PQ-only，关闭经典兜底；独立密钥与备份先于 NFT 迁入。
3. 签确定批次，不给普通 operator 长期发布权。
4. 专用发布身份优先，明确 TapeSend 不兼容和新建站点地址变化。
5. 发布规划按真实 gas 预算分块；不把 24KB 存储上限当可直接使用的默认值。
6. 历史证据、可运行实验、待实现产品严格区分。

依据与固定版本：[PROVENANCE](PROVENANCE.md)。后续开发拆解：[DEVELOPMENT-PLAN](DEVELOPMENT-PLAN.md)。
