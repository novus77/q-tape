# Q-Tape M3 Pilot Plan

> M3 is gated on an independent security review and explicit written approval for the test/pilot environment, assets and budget. Nothing in this plan authorizes a public-chain transaction or real NFT migration.

**Goal:** 在外部审查通过、测试/试点环境与预算明确批准后，进行小范围、可监控、可退出的专用站点试点，并验收监控、费用策略和应急流程。

**Base:** `m3-readiness` from `m2-pilot`. This document is a plan plus local-only operations tooling; all current evidence remains loopback-only.

## Task M3.1：运营监控与费用策略（本地准备）

**Files:** `apps/relayer/src/service.ts`（`/metrics`）、`apps/relayer/src/store.ts`、`scripts/monitor.ts`、`docs/OPERATIONS.md`。

- [x] relayer `/metrics` 汇总请求总数、状态分布和最后更新时间，不暴露请求签名/私钥。
- [x] `scripts/monitor.ts` 同时检查 relayer health/metrics 与 RPC chain/block，返回 JSON 并在异常时 exit 1。
- [x] 文档化 gas/value 上限、relayer 资金风险、告警阈值、事故停止和用户自行广播路径。
- [ ] 在真实测试/试点环境配置独立监控端点；本任务不部署公共环境。

**Gate:** 监控脚本在本地 relayer + fork 上可运行；费用上限不依赖单笔/单日预算之外的隐含授权。

## Task M3.2：外部安全审查闭环（阻塞）

- [ ] 外部审查方接收 `docs/SECURITY-REVIEW-M2.md` 的 handoff 包。
- [ ] Critical/High findings 修复并复核；Medium/Low 有明确接受或修复记录。
- [ ] 审查报告与版本/commit 绑定。

**Gate:** 未关闭 Critical/High 不进入 M3.3。

## Task M3.3：测试/试点环境演练

- [ ] 明确链、RPC 运营方、site name、NFT/tokenId/Container、测试资产与费用预算。
- [ ] 固定 profile 的 implementation slot、processor code hash、verifier code hash 和 Vault 地址。
- [ ] 使用测试密钥完成从空 Vault、deposit、发布、回读、续期、换钥到 exit 的演练。
- [ ] 验证监控、告警、relayer 停止后用户自行广播、RPC 分歧停止和紧急退出。

**Gate:** 演练全程无真实资产；测试网/自部署 fixture 与官方协议兼容性声明严格区分。

## Task M3.4：小范围主网专用站点试点

前置：外部审查通过 + 明确书面批准 + 确定专用站点/资产/预算 + 监控和退出方案。试点只接受专用发布 circuit；不接收 TapeSend 兼容性声明。

- [ ] 试点范围和资产清单经用户确认，完整展示链、Vault、NFT、Container、操作与费用。
- [ ] 设置 relayer gas/value 限额和人工监控；不承诺无偿长期服务。
- [ ] 发布后同区块双运营方回读；异常时停止提交并保留用户自行广播能力。
- [ ] 结束后执行回收/退出，记录结果和残余风险。

**Gate:** 任一异常触发停止；不扩大到其他站点或资产。

## Task M3.5：试点验收与复盘

- [ ] 记录实际费用、延迟、失败率、RPC 分歧、恢复演练和用户操作摩擦。
- [ ] 更新 [ACCEPTANCE-M2.md](ACCEPTANCE-M2.md) 之后的试点报告；未验证项不得写成已完成。
- [ ] 明确是否进入下一阶段；不预设主网上线日期。

**Gate:** 试点结论只覆盖实际站点、实际版本和实际观察区块。
