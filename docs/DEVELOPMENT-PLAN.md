# Q-Tape MVP Development Plan

> For agentic workers: follow `SPEC-v0.1.md`, implement one task at a time with real tests, and keep production behavior separate from `experiments/`. The plan describes future MVP work; it is not a claim that those modules already exist.

**Goal:** 从已验证 PoC 交付可独立使用、可由发布工具集成的 DeWEB 发布权限 MVP。

**Architecture:** 固定版本 Vault 强制 Falcon 授权；Protocol 统一 ABI/摘要；Client 负责链与发布；本地 native signer 处理密钥；CLI、relayer、Web 使用同一协议。

**Tech stack:** Solidity/Foundry、Bun/TypeScript、viem、固定 profile 的 native Falcon signer、age passphrase 文件。Web 框架可由实施者选择，不改变签名/钱包边界。

**Spec:** [SPEC-v0.1.md](SPEC-v0.1.md)。默认分支 `dev`。

## Global constraints

- 当前任务只完成规范、独立仓库和可复现实验。下方 M1 产品代码未开始。
- 不复制实验明文密钥存储或无限制 HolderProbe 为生产入口。
- 私钥不进入 relayer、CI、Web 或普通 client SDK。
- 不同签名域不得兼容放行；正式目标域为 `Q-Tape Guardian v1`。
- X Layer 优先；未支持 profile 默认停止。全部真实资产动作另行明确授权。
- 每个 package 目录运行其测试，禁止从仓库根目录直接执行通配全仓 `bun test`。

## Review focus

1. 同一请求由 Solidity/TypeScript/native signer 独立编码，拒绝字符串/字节、整数精度与域歧义。
2. 合约允许的每个出口都绑定完整签名，无 operator/approval/经典恢复旁路。
3. 密钥恢复错误不能触发 NFT 迁入；换钥同时验证新钥 proof。
4. 提交结果未知、RPC 不一致、nonce 冲突时不重复部署或重签另一个请求。
5. gas/文件块/跨批次限制有实际覆盖；展示确认与字节核验的差别。

## P0：本仓库初始化

- [x] 固化已验证事实与未测边界，形成 Spec v0.1。
- [x] 迁入选定的 PoC 源码、测试和历史公开证据，不迁入私钥。
- [x] 为独立仓库定义本地依赖、锁定版本和复现入口。
- [x] 在独立仓库重新执行完整验证并记录结果：21/21 测试、8 笔本地交易覆盖 5 个行为用例。
- [x] 完成规范 builder check，创建[公开 GitHub 仓库](https://github.com/novus77/q-tape)并推送默认分支 `dev`。

## Task M1.1：Schema 与签名协议

**Files:** `packages/schema/src/request.ts`、`packages/schema/src/key.ts`、`packages/protocol/src/request.ts`、`packages/protocol/src/key-proof.ts`，以及各自 `test/`。

**Consumes:** Spec §8/§9 的类型、整数编码、操作枚举、KeyProof。

**Produces:** `RequestV1`、`SignedRequestV1`、`KeyBundleV1`、`encodeRequest`、`encodeKeyProof`。全部从各模块具名导出。

- [ ] 先写固定向量与负例：精度超过 Number 安全范围、奇数 hex、错误 operation、错域、错 Vault、错调用顺序、KeyProof 绑定错误。
- [ ] 运行并确认尚无实现时失败；实现一次性边界解析与纯 ABI 编码。
- [ ] 用单独 Solidity harness 与 TypeScript 对相同手工输入输出相同 callsHash/digest；不以同一个 helper 生成两侧 expected。
- [ ] 参考 signer 验证真实签名；实验域签名必须在生产域失败。

**Gate:** 类型和编码是后续模块的唯一入口，不出现第二套隐式 request 编码。

## Task M1.2：正式 Guardian 合约

**Files:** `contracts/src/Guardian.sol`、`contracts/src/interfaces/`、`contracts/test/`。

**Consumes:** M1.1 的请求和 KeyProof 字节规范，以及经过核实的外部部署 profile。

**Produces:** 固定参数、无经典管理员入口的正式 Guardian ABI/编译产物；操作/拒绝/换钥/退出事件；与实验隔离的部署交易构造数据。

- [ ] 先写初始化伪造身份、无效配置/公钥、新钥 proof 缺失/错误的拒绝用例。
- [ ] 实现外部身份与代码约束、固定 verifier、受限制的 EXECUTE/EXIT/ROTATE_KEY。
- [ ] 移植 21 项实验相关能力为正式合约回归，保留真实 Falcon；补充 expiry 等于当前秒、溢出/空批次/恶意 calldata 边界。
- [ ] 用真实调用验证无 approval、任意目标、其他 Container、非零 operator TTL 或旧钥绕过路径。
- [ ] 批次失败后核对状态与 nonce；定义正式部署的代码指纹与 constructor 参数验证。

**Gate:** 不能通过重命名 GuardianLab 完成此任务；独立代码审查通过后才供其他模块接入。

## Task M1.3：本地 signer 与加密备份

**Files:** `packages/signer/src/`、`packages/signer/native/`、`packages/signer/test/`、`docs/KEYS.md`。

**Consumes:** M1.1 的 bundle/proof/request；M1.2 的预测/实际 Vault 地址。

**Produces:** `createKeyBundle`、`verifyBackup`、`signDigest`、`createKeyProof`，以及固定 native signer/age 版本与安装说明。

- [ ] 先写真实进程输入输出用例：错误口令、损坏/错算法 bundle、错误公钥、恢复失败、stdin/fd 不可用；检查 stderr 不含私钥/口令。
- [ ] 采用已存在的 age passphrase 格式和独立系统随机性，流式连接 native signer；不自制加密算法。
- [ ] 从加密备份恢复后，生成 KeyProof 并由真实 verifier 接受。
- [ ] 锁定并记录工具版本、许可证、macOS/Linux 支持和进程退出处理；私钥不进入 argv/env 或明文临时文件。

**Gate:** 能在独立机器从备份恢复相同公钥并签名。恢复失败必须阻止迁入流程。

## Task M1.4：Client SDK 与发布规划

**Files:** `packages/client/src/inspect.ts`、`planner.ts`、`simulate.ts`、`submit.ts`、`verify.ts`；`config/profiles/`。

**Consumes:** M1.1 类型与编码、M1.2 合约 ABI；不依赖 Signer/Relayer 实现。

**Produces:** `inspectSite`、`planRelease`、`submitSignedRequest`、`verifyRelease` 和普通钱包未签名交易描述。

- [ ] 先写 profile 未支持、实现变化、RPC 分歧、账户三元组不匹配、消息身份兼用、历史权限不明的阻断用例。
- [ ] 实现固定区块/独立运营方读取、Vault 参数和 code 指纹核对。
- [ ] 针对空/多块文件、符号链接、路径逃逸、产物被改、超 350 块和预算边界写真实规划用例。
- [ ] 实现候选 12KB 块/预算分批；最终签名后模拟真实执行，超预算回规划，不由 relayer 变更签名内容。
- [ ] 验证零/非零费用与变费；真实协议暂无可用场景时 fixture 明确标注，不能替换真实协议结论。
- [ ] 回读长度、字节 SHA-256 与 manifest，确认交易不等于文件已核验。

**Gate:** 独立 SDK 使用者不需安装 server/signer 代码，亦可得到相同计划和验证结果。

## Task M1.5：CLI 独立闭环

**Files:** `packages/cli/src/`、`packages/cli/test/`、`docs/CLI.md`。

**Consumes:** Client、Signer、版本化本地执行日志。

**Produces:** Spec §11 列出的命令、JSON 输出与稳定错误码。

- [ ] 先写用户取消、错误链/密钥、部署 nonce 改变、结果未知与重复提交的端到端命令用例。
- [ ] 实现 inspect、备份演练、prepare/deposit 交易描述、release plan、sign、submit、verify、revoke、rotate、exit。
- [ ] CLI 先展示完整 diff/操作与预算，再解锁签名；所有会改变资产或站点的请求保存可核对摘要。
- [ ] 用固定主网 fork 完成从空 Vault 到退出的完整流程，不借用其他发布平台。

**Gate:** 新用户只依赖说明与普通钱包能跑完闭环，不手工拼 ABI，不上传 Falcon 私钥。

## Task M1.6：可替换 relayer

**Files:** `apps/relayer/src/`、`apps/relayer/test/`、`docs/RELAYER.md`。

**Consumes:** SignedRequest V1、Client SDK；不依赖 Signer。

**Produces:** Spec §12 的 HTTP 接口、digest 幂等记录、预算策略与可恢复提交记录。

- [ ] 先写重复请求、篡改、过期、nonce 冲突、模拟拒绝、节点超时和服务重启恢复用例。
- [ ] 相同 digest 返回同一结果；submitted/confirmed/verified 不混用。
- [ ] 实现限额及 gas/value 资助策略；用户仍可换广播方或自行提交。

**Gate:** relayer 数据库/私钥泄露不能单独取得受保护 NFT 或创建新的发布授权。其 gas 资金风险须单独管理。

## Task M1.7：普通钱包接入与状态界面

**Files:** `apps/web/`、`docs/INTEGRATION.md`。

**Consumes:** Client SDK、普通钱包 provider、公开 Vault/发布证据。

**Produces:** 部署/迁入确认界面、保护状态页、发布核验页；无浏览器 Falcon 私钥入口。

- [ ] 用实际组件覆盖错误网络/账户、未支持 profile、部署参数不符、恢复未完成、退出保护、结果未知状态。
- [ ] 明确区分 NFT 已迁入与保护已核验；展示观察区块与范围。
- [ ] 一个示例发布工具适配器通过公开接口完成固定产物签名请求；不声称已集成第三方平台。

**Gate:** 只读访客不被要求连接钱包；用户能看到真实的目标资产与部署范围。

## Task M1.8：整体验收、CI 与安全审查准备

**Files:** `.github/workflows/`、`docs/ACCEPTANCE.md`、版本化公开测试向量和发布说明。

- [ ] 固定依赖和构建环境；快速检查与需要 RPC 的 fork 集成分开执行，失败明确显示。
- [ ] 对 Spec §14 的每项验收保存对应测试和结果；缺失项不得写成完成。
- [ ] 从干净 checkout、新测试密钥重复独立闭环与适配器流程。
- [ ] 独立评审正式合约、请求协议、密钥处理与依赖；记录修复和残余边界。

**Gate:** M1 完成只允许进入测试试用；主网真实资产迁移另行批准，并满足正式审查与预算要求。
