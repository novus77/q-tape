# 安全审查准备清单

本文件是 M1.8 的内部准备材料，不是独立审计报告。正式合约、协议编码、密钥处理与依赖均未经外部安全审查。

## 审查范围

| 范围 | 文件 | 重点 |
|---|---|---|
| 正式 Vault | `contracts/src/Guardian.sol`, `contracts/src/interfaces/IProtocol.sol` | constructor 身份绑定、KeyProof、三操作白名单、nonce/expiry/value、回滚、重入、无经典旁路 |
| 请求协议 | `packages/schema/src/`, `packages/protocol/src/` | uint256 十进制、地址/hex 规范、域分离、callsHash/digest、KeyProof 挑战编码 |
| 密钥处理 | `packages/signer/src/`, `packages/signer/native/` | age v1 passphrase、独立随机、stdin/fd、argv/env/log 泄漏、错误恢复 |
| Client/SDK | `packages/client/src/` | 双 RPC、ERC-1967 槽核对、profile fail-closed、规划边界、模拟、回读 |
| Relayer | `apps/relayer/src/` | 签名边界、digest 幂等、预算、重启恢复、私钥隔离 |
| Web | `apps/web/src/` | 无 Falcon 私钥入口、错误网络/账户、部署参数校验 |

## 已落实的关键约束

- 正式域 `Q-Tape Guardian v1` 与实验域 `Q-Tape lab Guardian v1` 相互拒绝，协议固定向量覆盖。
- 正式 Guardian 不是 `GuardianLab` 改名；无 owner、无代理、无 delegatecall、无任意调用、无 approve/setApprovalForAll、无经典恢复。
- 所有 EXECUTE 调用重新编码比较 calldata，拒绝尾随字节；EXIT 只允许三参数 `safeTransferFrom`。
- 注册与换钥均验证新公钥持有证明；备份恢复失败在 CLI `vault deposit` 前阻断。
- 私钥/口令不进入 argv、env、relayer、CI、浏览器、日志或明文临时文件；签名进程通过 stdin/stdout 管道。
- relayer 不修改已签请求；相同 digest 幂等返回原状态。

## 待外部审查确认

1. `Guardian.sol` 的外部协议调用假设与 reentrancy/异常边界（尤其 Registry/Binding 的未来实现）。
2. `fndsa-solidity` 依赖本身的实现正确性；本项目没有独立审计其密码学代码。
3. age-encryption 0.3.1 与 native signer 的供应链、许可证与跨平台构建可重复性。
4. relayer 单 RPC 与内存策略的运营风险；生产应增加双运营方一致性与持久化审计。
5. Web 的 EIP-1193 交互与 DOM 级错误状态测试尚未自动化。
6. 非零续期费用与真实主网费用路径。

## 残余边界（必须保留在发布说明）

- 保护只针对接入后的旧 ECDSA 私钥泄露、发布服务/relayer 被攻破、请求篡改/重放；不覆盖 Falcon 私钥主机被攻破、用户主动批准恶意内容、外部协议管理员与底层链失陷。
- 固定 fork 的观察不能泛化为所有部署版本、未来升级或全部历史授权。
- 本地交易不是主网部署；测试通过不是安全审计。
