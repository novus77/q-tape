# Q-Tape CLI (MVP)

`qtape` 组合 Client SDK 与本地 signer。它不依赖 TapeCI、HashPort 或任何发布平台，也不向浏览器、relayer、CI 或命令行参数传入 Falcon 私钥。

## 安装与构建

```bash
bun install --frozen-lockfile
bun run bootstrap          # 固定依赖 + 原生 Falcon signer + contracts vendor
(cd contracts && forge build)
```

CLI 入口：`bun packages/cli/src/main.ts`。所有命令支持 `--json`，输出 `{schema:"qtape.cli.v1",ok,...}`；失败输出 `{ok:false,error:{code,message}}`。成功 exit 0；校验/链/签名/权限错误 exit 1；用户取消 exit 2。

## 备份口令

- `key create` 从终端读取两次新口令（非交互时从 stdin 逐行读取）。
- 其他命令从终端读取一次口令。
- 口令不会出现在 argv、环境变量、日志或输出中；备份文件是 `age-encryption.org/v1` passphrase 格式，权限 `0600`。
- 备份恢复失败（错误口令、损坏文件、错误算法、公钥不匹配）返回 `INVALID_PASSPHRASE` / `CORRUPT_BUNDLE` / `INVALID_KEY_BUNDLE`，exit 1。
- `vault deposit` 强制先执行一次备份恢复演练；失败时不会输出 NFT 迁入交易。

## 独立闭环

```bash
# 1. 检查站点（两家 RPC；只读）
qtape inspect 10.2.4.tape \
  --rpc https://rpc.xlayer.tech --rpc https://xlayer.drpc.org

# 2. 本地生成 Falcon 密钥与加密备份
qtape key create --out ~/.qtape/old.age
qtape key verify-backup --key ~/.qtape/old.age

# 3. 生成空 Vault 部署交易（用普通钱包提交；KeyProof 绑定预测地址）
qtape vault prepare \
  --name 10.2.4.tape \
  --verifier 0x... --nft 0x68f65046fDEab90d8dB376C27B5E6AE159d240cc \
  --token-id 10 --container 0xC0B4900262d0bC13F2C67C0Fc4CF92c04E0aB814 \
  --deployer 0xYourWallet --key ~/.qtape/old.age \
  --artifact contracts/out/Guardian.sol/Guardian.json --json

# 4. 备份演练通过后生成 NFT 迁入交易；由普通钱包确认
qtape vault deposit --vault 0xVault --nft 0x... --token-id 10 --from 0xYourWallet --key ~/.qtape/old.age

# 4b. 续期：读取当前链上 monthlyFee，展示并签名精确金额
qtape vault renew --vault 0xVault --name 10.2.4.tape --months 1 --key ~/.qtape/old.age --out renew.json

# 5. 固定产物、比较差异、生成有序调用与批次
qtape release plan ./dist --site 10.2.4.tape --vault 0xVault \
  --rpc https://rpc.xlayer.tech --rpc https://xlayer.drpc.org --out plan.json

# 6. 本地审核批次后用 signer 签名（可逐批执行）
qtape request sign plan.json --batch 0 --key ~/.qtape/old.age --out signed-0.json

# 7. 自行广播（普通钱包）或交给 relayer
qtape request submit signed-0.json --relayer http://127.0.0.1:8787
# 或输出未签名交易，由用户钱包提交：
qtape request submit signed-0.json --json

# 8. 按同一区块两家 RPC 回读文件长度、SHA-256 与 manifest
qtape release verify plan.json --block 74818831 \
  --rpc https://rpc.xlayer.tech --rpc https://xlayer.drpc.org

# 9. 换钥与退出
qtape key rotate --vault 0xVault --key ~/.qtape/old.age --new-key ~/.qtape/new.age --out rotate.json
qtape request submit rotate.json --relayer http://127.0.0.1:8787
qtape vault exit --vault 0xVault --to 0xRecipient --key ~/.qtape/new.age --out exit.json
qtape request submit exit.json --relayer http://127.0.0.1:8787
```

## 稳定性与边界

- `request submit` 在本地 wallet 模式下会先对确切 calldata 执行 `eth_estimateGas`；超过 `--gas-budget`（默认 8,000,000）时拒绝广播并返回 `BUDGET_EXCEEDED`。
- 多批次使用链上当前 nonce 逐个签；`request sign --batch N` 使用 `plan.nonce + N`，不要跳过已经提交的批次。
- `release plan` 默认镜像整站（会删除远端多余文件）；只新增/更新时加 `--no-prune`。
- 空文件、多块文件、符号链接与路径逃逸在规划阶段拒绝；单文件默认上限 1 MiB、整站 5 MiB、每文件 350 块。
- `vault renew` 读取当前 `monthlyFee()`，月份范围 1–120；签名后费用变化会模拟失败并要求重新报价，不会静默多扣。
- `--wallet-key-file` 仅用于本地 fork 自动化；生产用户应使用外部普通钱包提交 `request submit --json` 输出的未签名交易。
- Falcon 实验签名域与正式域相互拒绝；不要导入实验签名。
- 未完成：浏览器 Falcon 签名、非零续费场景、完整历史权限枚举、安全审计、主网真实资产迁移。

## 错误码

`USAGE`、`CANCELLED`、`CHAIN_MISMATCH`、`UNSUPPORTED_PROFILE`、`CONFIG_CHANGED`、`NOT_TAPEOUT`、`NO_SUCH_TOKEN`、`NOT_OPENED`、`INVALID_REQUEST`、`INVALID_SIGNATURE`、`NONCE_CONFLICT`、`EXPIRED`、`SIMULATION_FAILED`、`BUDGET_EXCEEDED`、`BACKUP_VERIFICATION_FAILED`、`RPC_DISAGREEMENT`、`BROADCAST_UNKNOWN`、`FILE_INVALID`、`IO_ERROR`。CLI 当前实现映射到核心集合；未触发的错误不会伪装成成功。
