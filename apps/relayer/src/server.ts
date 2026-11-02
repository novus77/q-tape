import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ViemRelayChain } from "./chain.js";
import { RelayStore } from "./store.js";
import { createRelayerApp } from "./service.js";
import type { Hex } from "viem";

const rpcUrl = process.env.Q_TAPE_RELAYER_RPC_URL;
const privateKeyFile = process.env.Q_TAPE_RELAYER_PRIVATE_KEY_FILE;
if (!rpcUrl || !privateKeyFile) {
  console.error("Q_TAPE_RELAYER_RPC_URL and Q_TAPE_RELAYER_PRIVATE_KEY_FILE are required");
  process.exit(1);
}
const chainId = Number(process.env.Q_TAPE_RELAYER_CHAIN_ID ?? "196");
const port = Number(process.env.Q_TAPE_RELAYER_PORT ?? "8787");
const dbPath = resolve(process.env.Q_TAPE_RELAYER_DB_PATH ?? "./.qtape/relayer.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });
const privateKey = readFileSync(privateKeyFile, "utf8").trim() as Hex;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  console.error("relayer private key file must contain a single 32-byte hex key");
  process.exit(1);
}
const allowed = process.env.Q_TAPE_RELAYER_ALLOWED_GUARDIANS
  ?.split(",")
  .map((value) => value.trim())
  .filter(Boolean) as Hex[] | undefined;

const store = new RelayStore(dbPath);
const chain = new ViemRelayChain({
  rpcUrl,
  chainId,
  privateKey,
  maxGas: BigInt(process.env.Q_TAPE_RELAYER_MAX_GAS ?? "8000000"),
  maxValue: BigInt(process.env.Q_TAPE_RELAYER_MAX_VALUE ?? "0"),
  allowedGuardians: allowed,
});
const app = createRelayerApp({ store, chain });
await app.reconcile();
const server = Bun.serve({ port, fetch: app.fetch, idleTimeout: 30 });
console.log(JSON.stringify({ relayer: "listening", url: `http://127.0.0.1:${server.port}`, chainId, database: dbPath }));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.stop(true);
    store.close();
    process.exit(0);
  });
}
