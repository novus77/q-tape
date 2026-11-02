# Q-Tape 三项权限验证结果

日期：2026-11-02（Asia/Shanghai）。范围：本地 X Layer fork 与最小实验 Guardian。

历史参考结果归档于 `evidence/2026-11-02/`；以下报告描述该次实验。[独立仓库重跑](../evidence/standalone-2026-11-02/README.md)同样通过 21 项测试和 5 个行为用例；新测试密钥下发布/转出 gas 分别为 3,290,735 / 3,038,459，全部为本地交易。

## 结论

三项验证在固定部署版本与本地实验边界下均通过：

| 验证问题 | 实际结果 |
|---|---|
| 合约持有 NFT 后，能否发布、追加、删除文件、设置 fallback 与续期？ | 能；通过真正的合约调用已部署 Registry/Binding，检查了字节、文件信息、路径与到期时间 |
| 原 owner、迁移前 operator 和旧 NFT 批准者是否丧失相应权限？ | 所测原 owner 与旧 Registry operator 的五个写入入口均被拒；旧 operator 在迁移前已验证可写，且不能转授；旧 NFT 批准者不能转走迁移后的 NFT |
| 参数篡改、重放、无签名转出能否被 Guardian 阻止？ | 能；真实 PQClean Falcon-512 签名配合真实 Solidity verifier 的正负例通过 |

完整实验包含 **21 项测试：6 项真实协议权限测试，15 项真实 Falcon Guardian 测试**。当前结果为 21 通过、0 失败、0 跳过。依赖的密码学代码未经本项目独立审计；这不是生产钱包认证。

另完成独立 JavaScript 应用编码的完整本地交易验证，见下方“独立应用端与 gas 上限验证”。

## 实验环境

- 本地节点：`127.0.0.1:18545`，Anvil 从 X Layer 公共 RPC 只读取回固定快照。
- 链 ID：`196`；区块：`74818827`。
- 区块哈希：`0xb8433ae3f968b1e3326113a94a549577c836d45556320e861ec6667a9a3742c2`。
- 测试站点：`10.2.4.tape`。
- circuit NFT：`0x68f65046fDEab90d8dB376C27B5E6AE159d240cc`，tokenId `10`。
- Container：`0xC0B4900262d0bC13F2C67C0Fc4CF92c04E0aB814`。
- SiteRegistry：`0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6`，实现 `0xa85c4143d1d4a77f54b8e4ecc9e6d1418afea45f`。
- DomainBinding：`0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9`，实现 `0x5ebf29b80789e548907c707530c3c7607c4347df`。
- Solidity `0.8.26`，optimizer 200，via-IR，Cancun。
- fndsa-solidity：`54a14f251786686c41839c2f0cdb3655ea245ea3`。
- pq-verifier-interface：`6efa8e3eed3d89c301856e3fa8bb74b63eaa9f02`。
- PQClean：`0586a824fc0d49df0b6b6e9179d8d15d06d0974f`，Falcon-512 clean reference implementation。

所有测试写入仅存在本地测试 EVM；没有向公共链广播交易，没有访问用户真实私钥，也没有迁移真实 NFT。测试使用新生成且仅用于本实验的密钥。

## 第一项：合约 holder 功能

先将 fork 内的 NFT 转入不带密码学限制的 HolderProbe，验证 `ownerOf` 与 `Container.owner()` 都指向它。随后通过 `测试调用者 -> HolderProbe -> 已部署合约` 执行操作，而不是将 RPC 的 `from` 伪装成合约地址。

- `putFile + appendChunk` 得到 `hello world` 的 11 字节文件，块数为 2，声明 SHA-256 与预期一致。
- `setFallback` 更新回退路径。
- `removeFile` 让当前文件记录大小和块数归零；不要求历史文件块代码消失。
- `bind("10.2.4.tape", container, 1)` 将激活期限从 `1795513090` 延长至 `1798105090`，增加 30 天。
- 所测区块 `monthlyFee()` 为 0。本实验没有声称验证非零月费的完整协议收费路径。

之后同样的真实协议操作通过 Guardian + Falcon 授权复测成功。

## 第二项：旧权限

原 owner 的五个 Registry 入口：`putFile`、`appendChunk`、`removeFile`、`setFallback`、`setOperator`，均返回 `0x30cd7471`；文件未被修改。原 owner 以 holder 身份续期也失败。

对 Registry operator：

1. 原 owner 在迁移前给一个测试 operator 授权 30 天。
2. operator 在迁移前实际写入成功，排除了“本来就没有权限”的假阴性。
3. NFT 转入合约后，该 operator 对上述五个写入口均被拒绝；原文件保持不变。
4. 另一个用例证明：该 operator 即使在迁移前仍然有效，也不能设置二级 operator。

**关键发现：所测版本不需要先显式撤销这个 operator，它在 NFT 转移后已经失去有效编辑权限。** 这只是固定部署下的观察结论，不证明存储中的授权记录被删除，也不能泛化为未来所有版本的行为。

对 NFT 授权：迁移前分别设置单 token approval 与原 owner 的全局 operator；迁移后单 token approval 归零，新 holder 未授权全局 operator。原 owner、原单 token 批准者、原全局 operator 都无法转出 NFT。

## 第三项：真实 Falcon 授权

不是用恒为 true 的 verifier，也不是只播放静态签名样本。每个有效请求由本地 PQClean 签名，C 参考实现先自验，再交给固定源码的 Solidity verifier 验证。

实验签名格式使用域分隔摘要，覆盖协议版本、chainId、Guardian 地址、操作类型、完整有序调用批次哈希、nonce、expiry。测试端独立编码该协议，不调用 Guardian 返回的摘要来生成签名。

正例包括发布、追加、fallback/删除批次、续期、撤销旧 operator、轮换公钥、NFT 转出，以及更换 relayer 广播同一有效请求。

负例包括：

- 缺失/篡改签名、错误 Falcon 私钥。
- 修改 target、value、calldata、操作类型、nonce、expiry。
- 改变已签批次的操作顺序。
- 已成功请求再次提交、过期请求。
- 跨 chainId 或跨 Guardian 重放。
- 旧 owner/operator/任意调用者直接转出 NFT。
- 用正确签名尝试创建普通 operator、批准第三方转移 NFT、写入其他 Container。
- 更换公钥后继续用旧 Falcon 私钥操作。

批次的后续调用失败时，前面的文件写入与 nonce 消费都回滚；原 nonce 可用于新的有效请求。

## 独立应用端与 gas 上限验证

为避免只在 Solidity 测试中重复摘要表达式，还用 JavaScript/viem 独立执行 ABI 编码，交给 PQClean 签名，并向本机 Anvil 实际提交交易。脚本硬编码 loopback 地址，检查 Anvil 客户端及固定区块后才允许发送，结束时还原快照。

最终成功的一轮包含 8 笔本地交易：3 笔准备交易，以及下列 5 个行为用例：

| 本地交易 | 实际收据 | gasUsed |
|---|---|---|
| 参数被篡改的发布请求 | reverted | 3,082,915 |
| 合法 Falcon 发布 | success，文件字节回读一致 | 3,386,592 |
| 已成功请求再次提交 | reverted | 60,750 |
| 原 owner 直接转出 Guardian 持有的 NFT | reverted | 37,276 |
| 合法 Falcon NFT 转出 | success，ownerOf 更新为指定接收者 | 3,132,166 |

每笔 Guardian 交易显式限制为 8,000,000 gas。这证明完整调用可在该本地上限内执行，不等于已经完成公网广播、当前主网费用报价或生产审计。签名有随机性，后续重跑的精确 gas 数字可能略有差异。

完整交易最终快照已还原到区块 `74818827`，公共链广播数仍为 0。

补充夹具发现：默认开发账户之一在主网快照中已有 EIP-7702 委托代码，不应按无代码账户处理。成功转出用例改为显式确认无代码的接收地址；普通合约接收者仍须符合 ERC-721 接收规则。另修正了本地自动挖矿异步返回与收据等待/快照还原的时序，不能把这些工具问题当作 Guardian 权限问题。

## 对项目方案的影响

- 当前路线在所测部署上具有可行性：Guardian 作为真正 holder 能管理站点，无需依赖普通 EOA operator 代写。
- 首发仍应取消普通 operator 委托入口。保留受 PQ 授权且固定 TTL=0 的撤销能力即可。
- 接入界面应区分 NFT 已迁入和权限已核验；不能把本实验的一枚 NFT 推广为任意站点已自动完成全面权限扫描。
- 当前成果是一套可复现验证与实验合约，尚未构成可交付主网用户的完整 Vault 产品。

## 复现与证据

实验目录：`experiments/guardian-fork`。其中 README 给出 bootstrap、启动 fork 和运行命令。

```bash
forge test --fork-url http://127.0.0.1:18545 -vv
forge test --fork-url http://127.0.0.1:18545 --json > results/final-tests.json
forge fmt --check src test
```

- `results/final-tests.json`：完整 Foundry 机器结果。
- `results/environment.json`：区块、代码指纹、实现地址和上游源码校验。
- `results/summary.json`：测试分组与逐项结果。
- `results/e2e-transactions.json`：独立 JavaScript 编码的真实本地交易收据与 gas。
- `progress.md`：实验中的失败、定位和修正。

初始出现的两类失败已定位：Shanghai EVM 不支持已部署 Registry 的 MCOPY；一次性 `vm.prank` 被先计算的 SHA-256 预编译调用消耗。这些属于本地环境/测试夹具问题，修正后重新测试，未将它们当作协议行为结论。

## 核验边界

没有完成：外部协议源码的完整审计、全部历史授权的全量枚举、未来升级行为、非零续期费用、TapeSend 加密消息兼容、生产密钥管理、多签恢复、浏览器 signer、主网部署及底层链的后量子安全。

独立审查复跑 21 项测试及格式检查，未发现该实验范围内的阻断问题。审查明确指出：operator 结论仅覆盖所测授权；旧 operator 在撤销前已失效，因此该用例只证明 PQ 授权的 TTL=0 调用成功，不单独证明失效由撤销造成；失败批次后的用例是新签请求，不是同一请求重试。这些边界已保留。测试与代码审查都不能替代安全审计。

对补充的 JavaScript 编码与本地交易证据进行了独立跟进审查，未发现重要问题；互操作结论仅覆盖已执行的单调用发布和 NFT 转出，尚未覆盖独立 JavaScript 的批次、续期与换钥编码。交易收据的 reverted 状态本身不提供确切拒绝原因，对应鉴权分支另由 Solidity 测试覆盖。
