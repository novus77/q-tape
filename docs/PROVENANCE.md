# 来源、版本与证据

更新：2026-11-02。规范中的事实依赖于固定版本与明确实验，不以项目宣传文本替代实现。

| 来源 | 固定版本 | 作用 |
|---|---|---|
| [TapeOut TAP-10](https://github.com/TapeOutProtocol/TAPs/blob/075dd834a72c4c5b251d97f183cac9d42d8ccd66/TAPs/TAP-10.md) | `075dd834a72c4c5b251d97f183cac9d42d8ccd66`，v1.1 Draft | DeWEB 访问/消息、身份与站点接口；取代旧 TapeKit SPEC v0.2 |
| [TapeKit](https://github.com/TapeOutProtocol/TapeKit/tree/37c617e7e332787c8a32a81e4d7d05a28a06c156) | `37c617e7e332787c8a32a81e4d7d05a28a06c156` | 网站文件读取实现、链配置、DeWebHub 权限限制 |
| [fndsa-solidity](https://github.com/skalenetwork/fndsa-solidity/tree/54a14f251786686c41839c2f0cdb3655ea245ea3) | `54a14f251786686c41839c2f0cdb3655ea245ea3` | 实验用 Falcon Solidity verifier；MIT；未经第三方审计 |
| [pq-verifier-interface](https://github.com/skalenetwork/pq-verifier-interface/tree/6efa8e3eed3d89c301856e3fa8bb74b63eaa9f02) | `6efa8e3eed3d89c301856e3fa8bb74b63eaa9f02` | verifier 接口与算法 ID；保留源文件 SPDX |
| [PQClean](https://github.com/PQClean/PQClean/tree/0586a824fc0d49df0b6b6e9179d8d15d06d0974f) | `0586a824fc0d49df0b6b6e9179d8d15d06d0974f` | Falcon-512 clean C 参考签名；各算法/公共文件按其原许可证 |
| [forge-std](https://github.com/foundry-rs/forge-std/tree/f3dae6e6ee381f25eb6a246f7da9b85c91a68219) | v1.17.0，`f3dae6e6ee381f25eb6a246f7da9b85c91a68219` | 独立仓库测试工具；MIT/Apache-2.0 |

第三方依赖由 bootstrap 下载到被忽略的 vendor，不属于本项目重新授权的代码。不得删去其 SPDX 或许可证。

原始实验借用了其他工作区中的 forge-std 文件夹，并非独立的上游 git checkout。独立仓库明确改用上述可公开获取的固定版本，并重新验证全部实验；不将原父仓库提交误写成 forge-std 上游版本。

## 链上快照

- Chain ID：196。
- Block：74818827。
- Block hash：`0xb8433ae3f968b1e3326113a94a549577c836d45556320e861ec6667a9a3742c2`。
- Fixture site：`10.2.4.tape`。
- 具体实现与代码指纹：[environment.json](../evidence/2026-11-02/environment.json)。
- 独立仓库重新复现的环境与完整固定依赖：[standalone environment.json](../evidence/standalone-2026-11-02/environment.json)。

该快照下的 Registry 月费为零；不推断当前主网费率。当前网站存储机制已通过文件读回与文件块合约代码样本核对，文件字节使用 EVM code-as-data，不是只存哈希。

## 尚未采用的产品依赖

MVP 的加密备份建议采用现成 [age 的 passphrase 模式](https://github.com/FiloSottile/age/blob/main/doc/age.1)，避免自行发明加密文件格式。具体发行版本、跨平台安装与签名进程流式解密须在 M1 验收前固定并审查；当前实验没有实现或验证此产品能力。
