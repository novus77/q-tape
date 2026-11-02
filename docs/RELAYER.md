# Q-Tape relayer (MVP)

可替换 relayer 只接收 `SignedRequestV1`，不接收 Falcon 私钥、备份口令或未签名执行覆盖参数。用户可以随时换 relayer 或自行广播同一有效请求。

## 接口

```
POST /v1/requests            SignedRequestV1 -> 202 {digest,status,...}
GET  /v1/requests/:digest    digest -> status record
GET  /health                 {ok, chainId, blockNumber}
```

digest 是幂等请求 ID。相同 digest 重复提交返回原记录，不会重新模拟、重签或生成另一份发布。状态：`received -> simulated -> submitted -> confirmed`，失败路径为 `reverted` / `expired` / `unknown`。202 只表示接收/提交，不表示发布已验证。

错误码：`INVALID_REQUEST`、`INVALID_SIGNATURE`（由模拟失败映射）、`NONCE_CONFLICT`、`EXPIRED`、`UNSUPPORTED_PROFILE`、`SIMULATION_FAILED`、`BUDGET_EXCEEDED`、`NOT_FOUND`。

## 启动

```bash
# 只用于本地 fork；私钥文件是 relayer 自己的 gas 资金密钥，不是 Falcon 私钥
Q_TAPE_RELAYER_RPC_URL=http://127.0.0.1:18545 \
Q_TAPE_RELAYER_PRIVATE_KEY_FILE=./relayer-gas.key \
Q_TAPE_RELAYER_ALLOWED_GUARDIANS=0xVault \
Q_TAPE_RELAYER_MAX_GAS=8000000 \
Q_TAPE_RELAYER_MAX_VALUE=0 \
bun apps/relayer/src/server.ts
```

SQLite 数据库由 `Q_TAPE_RELAYER_DB_PATH` 指定（默认 `./.qtape/relayer.sqlite`），记录在重启后保留。启动和 GET 请求会协调已提交交易的收据。

## 安全边界

- relayer 数据库或 gas 私钥泄露不能单独取得受保护 NFT，也不能创建新的发布授权；它仍持有自己的 gas 资金风险。
- relayer 不修改、拆分、重排或更换已签请求，只提交确切 calldata。
- relayer 的 `maxGas`/`maxValue` 是服务政策，不是协议保证；用户可换服务或自行广播。
- 未实现：多 RPC 一致性检查（当前 relayer 使用单一 RPC；严格生产部署应在提交前增加双运营方校验）、动态费用市场、分布式幂等存储。
