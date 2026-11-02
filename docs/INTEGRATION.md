# 第三方发布工具集成

Q-Tape 的公共协议是 `RequestV1` / `SignedRequestV1` 与 `@qtape/client` SDK。集成方不持有 Falcon 私钥，也不应把 Falcon 私钥放进 CI、浏览器或 relayer。

## 最小集成

```ts
import { planRelease, submitSignedRequest, verifyRelease } from "@qtape/client";
import { readKeyBundle, signDigest } from "@qtape/signer"; // 仅在用户本地 signer 进程
import { createRequestV1 } from "@qtape/schema";
import { encodeRequest } from "@qtape/protocol";

const plan = await planRelease({
  site: "10.2.4.tape",
  vault: "0xVault",
  files: artifactFiles,          // 固定构建产物；之后不得由 CI 重新构建替换
  rpcUrls: ["https://rpc.xlayer.tech", "https://xlayer.drpc.org"],
});

const batch = plan.batches[0];
const request = createRequestV1({
  chainId: plan.chainId.toString(),
  guardian: plan.vault,
  operation: 0,
  calls: batch.calls,
  nonce: plan.nonce,
  expiry: plan.expiry,
});
const { digest } = encodeRequest(request);
const bundle = await readKeyBundle("/path/to/local.age", passphrase); // 用户本地
const signed = { request, digest, signature: await signDigest({ digest, bundle }) };

const submission = await submitSignedRequest({ signedRequest: signed }, { type: "relayer", url: "https://relayer.example" });
const result = await verifyRelease({ plan, rpcUrls: ["https://rpc.xlayer.tech", "https://xlayer.drpc.org"] });
```

示例适配器在 [`examples/publisher-adapter`](../examples/publisher-adapter/README.md)。它不是任何第三方平台集成的声明。

## 集成方必须

- 使用同一个 `planRelease` 与 `encodeRequest` 结果，不自己拼接第二份 calldata 或另一份不签名参数。
- 在本地 signer 中让用户看到完整 diff、目标、金额、nonce、expiry 和批次后再解锁签名。
- 提交确切 `SignedRequestV1`；relayer 不得拆分或重排已签批次。
- 只有 `verifyRelease` 返回 `VERIFIED` 时才显示发布已核验；交易成功事件不等于文件字节已核验。
- 未支持 profile、实现槽不匹配、RPC 分歧、恢复失败时停止，不显示安全徽章。

## 禁止

- 在 CI 生成或持有 Falcon 私钥。
- 先给集成方一个可任意发布的 EOA operator，再声称严格保护。
- 提供“跳过验签”模式或把实验 `Q-Tape lab Guardian v1` 签名导入生产。
- 声称已与 TapeCI、HashPort 等平台完成集成或已通过安全审计。
