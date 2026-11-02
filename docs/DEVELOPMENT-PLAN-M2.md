# Q-Tape M2 Development Plan

> For agentic workers: M2 builds on the completed M1 local MVP. M2 remains test/pilot work: **no public-chain transaction, no real NFT migration and no real user key** without a separate explicit request. External security review is a human gate; this plan prepares evidence and fixes in-scope findings but does not claim an independent audit.

**Goal:** 把 M1 本地 MVP 推进到可进行设计合作试用的候选：完成独立安全审查准备与加固、非零续费/试用环境、一个真实静态发布工具适配、浏览器 UX 与恢复演练、试用验收与 CI。

**Base:** `mvp-m1-build` / PR #1. M2 branch: `m2-pilot`.

**Spec:** [SPEC-v0.1.md](SPEC-v0.1.md) §15 M2. **M1 record:** [ACCEPTANCE.md](ACCEPTANCE.md).

## M2 执行状态（2026-11-02）

M2.1–M2.4 的内部实现、静态检查、测试和文档已完成；M2.5 的 E2E/验收材料已完成。**外部独立安全审查尚未进行**，因此 M2 只能作为设计合作试用候选，不能接收真实资产。当前 `m2-pilot` 分支基于 `mvp-m1-build`，最终报告需列出具体命令与结果。

## Global constraints

- 不向公共链广播，不迁移真实 NFT，不使用用户真实密钥；只在本地 fork、fixture 与明确标注的测试环境运行。
- M2 不改变 M1 的授权/签名边界。任何“为了试用方便”而增加 EOA operator、跳过验签、浏览器 Falcon 私钥或 relayer 改签的路径都不允许。
- 外部独立安全审查必须由项目外部人员完成；本计划只准备材料、增加内部对抗测试、修复发现并记录残余风险。
- 每个任务先写失败测试/验收用例，再实现；测试从对应 package 或 `contracts/` 目录运行。根目录使用 `bun run check`，fork/集成使用 `bun run test:fork`。

## Task M2.1：安全审查准备与合约加固

**Files:** `contracts/test/GuardianInvariant.t.sol`、`contracts/test/GuardianFuzz.t.sol`、`scripts/security-review.ts`、`docs/THREAT-MODEL.md`、`docs/SECURITY-REVIEW-M2.md`。

**Consumes:** M1 Guardian、协议编码、signer 边界；`docs/SECURITY-REVIEW-PREP.md`。

**Produces:** 可复跑的静态检查、模糊/不变量测试、威胁模型、发现与修复记录、外部审查 handoff 清单。

- [x] 静态检查 M2.1：扫描 `contracts/src` 禁止 `delegatecall`、`selfdestruct`、`approve`、`setApprovalForAll`、任意 target、`receive`/fallback、可变 verifier、经典 owner/admin；扫描 client/signer/relayer 私钥材料不进入 relayer/CI/浏览器。
- [x] 新增 Foundry fuzz/invariant：随机 nonce/expiry/value/calldata/公钥长度不产生未授权成功；失败批次不改变 nonce/文件状态；nonce 成功路径严格 +1。
- [x] 内部对抗审查并修复发现；记录每条发现、证据、修复提交/测试。
- [x] 产出外部审查 handoff：范围、版本、固定依赖、威胁模型、已知边界、复现命令、审查问题清单。
- [x] Gate：`forge test` 全绿、静态检查 exit 0、SECURITY-REVIEW-M2 明确“外部审查未完成”。

## Task M2.2：试用环境、非零续费与费用变化

**Files:** `packages/client/src/fees.ts`、`packages/client/src/renewal.ts`、`packages/cli/src/commands.ts`（`vault renew`）、`packages/client/test/fees.test.ts`、`contracts/test/GuardianFeeFixture.t.sol`、`docs/FEES.md`、`docs/PILOT.md`。

**Consumes:** M1 profile/planning、DomainBinding ABI、M2.1 合约加固。

**Produces:** `readRenewalQuote`、`buildRenewalCall`、CLI `vault renew`；零费/非零费/费用变化测试；明确 fixture 与真实协议区别的试用环境说明。

- [x] 先写测试：月费读取、`months × monthlyFee` 溢出/上限（1–120）、零费、非零费、签名后费用变化导致模拟失败、重新报价后重新签名成功。
- [x] 实现 `readRenewalQuote`（从链上读 `monthlyFee()` 与当前区块）与 `buildRenewalCall`（精确绑定规范名字、Container、金额）。
- [x] CLI `vault renew` 读取链上费用、展示金额和 expiry、签名、提交/输出未签名交易；费用变化后不得静默多扣。
- [x] 增加明确标注的自部署 fixture 环境说明和试用角色/前置条件；不把 fixture 当作官方测试网。
- [x] Gate：费用测试通过；真实协议非零费用仍标为未验证，除非后续获得可用测试环境。

## Task M2.3：真实静态发布工具适配（Vite）

**Files:** `packages/adapter-vite/`、`packages/adapter-vite/test/`、`docs/ADAPTER-VITE.md`。

**Consumes:** `@qtape/client` 公开 SDK、`@qtape/schema`/`@qtape/protocol`；不依赖 CLI 或 signer 私钥处理。

**Produces:** `collectViteDist`、`planViteRelease`、`createViteSignedBatch`（可选，调用本地 signer）；一个可复跑的真实 Vite `dist` 适配流程；不声称 TapeCI/HashPort 集成。

- [x] 先写 fixture：Vite `dist` 目录含嵌套资源、空文件、非法路径/符号链接；验证被改成固定产物后计划不重新读取源目录。
- [x] 实现真实 `vite build` 输出目录的收集与 `planRelease` 调用；产物 SHA-256、路径、大小与 manifest 来自实际文件。
- [x] 提供 adapter CLI 示例：`vite build -> adapter plan -> 用户本地 signer 审核 -> 提交/回读`；不提供跳过验签或服务端密钥模式。
- [x] Gate：fixture 测试通过；文档明确“Vite adapter example，不是第三方平台集成”。

## Task M2.4：浏览器 UX 与恢复演练

**Files:** `apps/web/src/app.ts`、`apps/web/src/client.ts`、`apps/web/test/app.test.ts`、`packages/signer/test/process-recovery.test.ts`、`docs/UX.md`。

**Consumes:** M1 web server/view、signer bundle、M2 试用流程。

**Produces:** 可测试的 `mountApp` 组件；错误网络/账户、未支持 profile、部署参数不符、恢复失败、结果未知、退出保护等 DOM 状态；独立进程恢复演练。

- [x] 先写 happy-dom 组件测试（不启动浏览器、不连接真实钱包）：状态成功/失败、tab 切换、错误链/账户、无效 prepare 交易、verify RPC 分歧、无 wallet。
- [x] 重构 web 入口为 `mountApp(document, deps)`，保留现有页面和“无 Falcon 私钥”边界。
- [x] 在独立进程/临时目录从 `.age` 恢复公钥并完成 backup check，证明不依赖原工作树。
- [x] Gate：`apps/web` DOM 测试 + signer 进程恢复测试通过；仍无浏览器 Falcon 私钥入口。

## Task M2.5：试用验收、CI 与文档

**Files:** `.github/workflows/ci.yml`、`docs/ACCEPTANCE-M2.md`、`docs/PILOT.md`、`docs/RELEASE-NOTES-M2.md`、`scripts/m2-e2e.ts`。

**Consumes:** M2.1–M2.4。

**Produces:** M2 acceptance record、pilot checklist、clean-checkout M2 flow、CI fast/fork separation、版本化证据。

- [x] 把 M2 静态检查与 DOM/费用测试加入 `bun run check`；fork/试用流程加入 `test:fork` 或独立 `m2:e2e`。
- [x] `scripts/m2-e2e.ts` 在本地 fork 上跑：Vite `dist` → plan → 用户签署 → 提交 → 同区块回读 `VERIFIED` → 费用变化拒绝 → 恢复演练。
- [x] 记录真实结果、缺失项、外部审查 handoff 状态；不得把 fixture 或本地交易写成主网/审计结论。
- [ ] Gate：干净 checkout 下 `bun install --frozen-lockfile && bun run bootstrap && bun run check && bun run m2:e2e` 通过（本地 fork）。

## M2 Complete Gate

M2 完成只表示“可进入设计合作试用候选”，不等于可以接收真实资产。之后仍需：

1. 外部独立安全审查签字与发现关闭；
2. 明确测试/试点环境的资产与费用授权；
3. 设计合作方确认试用范围、监控与退出方案；
4. 主网真实资产迁移另行批准（M3）。
