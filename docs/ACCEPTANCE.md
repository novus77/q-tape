# M1 验收记录

日期：2026-11-02。所有结果均来自本仓库当前工作树；本地 X Layer fork 区块 74818827，链 ID 196。**没有向公共链广播交易、没有迁移真实 NFT、没有使用用户真实密钥。**

## 实际执行的验证

| 验证 | 命令 | 结果 |
|---|---|---|
| 实验回归（真实协议 + 实验 Guardian） | `bun run verify:fork` / `bun run verify:environment` / `bun run verify:e2e` / `bun run verify:summary` | 21/21 Foundry 测试通过；8 笔本地交易覆盖 5 个行为用例；快照恢复；21/21 |
| 正式 Guardian 合约 | `cd contracts && forge test --fork-url http://127.0.0.1:18545 -vv` | 48/48 通过（6 EncodingVectors + 42 GuardianFork） |
| 仓库离线检查 | `bun run check` | format、7 个 package typecheck、unit tests 全部通过 |
| 正式合约格式 | `cd contracts && forge fmt --check src test` | exit 0 |
| 真实 Falcon signer/age 备份 | `cd packages/signer && bun test` | 22/22 通过（真实 PQClean 进程、真实 age passphrase 文件、错误口令/损坏/错算法拒绝） |
| Schema/Protocol 固定向量 | `cd packages/schema && bun test`; `cd packages/protocol && bun test` | 10/10、13/13 通过；向量由 Foundry `cast` 独立生成 |
| Client 规划单元测试 | `cd packages/client && bun test` | 8/8 通过（fork 用例默认跳过；`Q_TAPE_RUN_FORK_TESTS=1` 时 4/4 fork 用例通过） |
| CLI 独立闭环 | `bun run scripts/mvp-e2e.ts` | 通过：备份失败阻断、恢复演练、真实 verifier 部署、预测地址部署、NFT 迁入、`PROTECTED`、计划/签名/提交/relayer 换钥、同区块双 RPC 回读 `VERIFIED`、operator revoke、退出 |
| 干净 checkout | `git clone` 后 `bun install --frozen-lockfile && bun run bootstrap && bun run mvp:e2e` | 通过；使用全新生成的测试密钥，无未提交文件依赖 |
| relayer HTTP/幂等 | `cd apps/relayer && bun test` | 6/6 通过（重复 digest、篡改、过期、nonce 冲突、模拟失败、重启恢复、simulated 重试） |
| Web 视图模型 | `cd apps/web && bun test` | 4/4 通过（保护状态、部署交易校验、核验状态） |
| 示例适配器 | `cd examples/publisher-adapter && bun run typecheck` | 通过；使用公开 SDK，不依赖 CLI/server 私钥 |

## Spec §14 覆盖映射

| 验收类别 | 证据 | 状态 |
|---|---|---|
| 真实协议 | `experiments/guardian-fork` 21 项；`contracts/test/GuardianFork.t.sol` 对正式 Vault 的固定 fork 回归 | 已测试（固定快照） |
| 密码学互操作 | `packages/protocol/test/vectors/request-vectors.json`（cast 独立生成）、`contracts/test/EncodingVectors.t.sol`、`packages/signer/test`（真实 PQClean） | 已测试 |
| 调用与域 | schema/protocol 负例、`GuardianFork.t.sol` 篡改/重排/跨链/跨 Vault/过期边界 | 已测试 |
| 管理出口 | `GuardianFork.t.sol` 无 approval、无任意目标、无 delegatecall、operator TTL 仅 0、换钥证明、旧钥失效 | 已测试 |
| 失败恢复 | 合约批次回滚/nonce；relayer 幂等/重启；E2E 重复提交不双发（合约用例） | 已测试（本地） |
| 文件 | `packages/client/test/planner.test.ts` 路径逃逸/符号链接（CLI 收集器）/大小/chunk；E2E 链上字节与 SHA-256 回读 | 已测试（样本） |
| 续期 | 实验零费续期；`contracts` 集成零费 bind | 部分：**非零费用未验证** |
| 生命周期 | `scripts/mvp-e2e.ts`：生成、错误口令、恢复、prepare、deposit、保护、发布、换钥、退出 | 已测试（本地 fork） |
| 独立集成 | CLI 全闭环；`examples/publisher-adapter` 使用同一 SDK 协议生成签名批次 | 已测试（示例，不是第三方平台） |

## 尚缺的验收

- 非零续期费用、费用变化、付费不足与上限路径：当前固定快照月费为 0，未用 fixture 冒充真实协议结论。
- 全部历史授权枚举、未来外部协议升级行为。
- TapeSend 加密消息兼容、多签恢复、浏览器 Falcon 签名。
- 独立安全审计；外部正式审查尚未进行。
- 公共测试网/主网部署与真实资产迁移需要单独明确授权。
- 浏览器 DOM/EIP-1193 的自动化 E2E 未接入 Playwright；当前 Web 只测试视图模型与 server API 逻辑。

## 判定

**M1 开发范围内可独立运行的 MVP 已实现并通过本地验收；不是安全审计结论，也不是主网部署。** 本地 E2E 的第二 RPC 是对同一 Anvil fork 的转发代理，只验证“同块双端点一致”代码路径，不证明两家真实运营方的独立性。 下一阶段按 `docs/DEVELOPMENT-PLAN.md` M2 进行外部审查、真实发布工具适配与试用。
