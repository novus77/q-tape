const suites = await Bun.file("results/final-tests.json").json()
const environment = await Bun.file("results/environment.json").json()
const e2e = await Bun.file("results/e2e-transactions.json").json()
const tests = Object.entries(suites).flatMap(([suite, result]) => Object.entries(result.test_results).map(([name, test]) => ({ suite, name, status: test.status, reason: test.reason, gas: test.kind?.Unit?.gas ?? null, logs: test.decoded_logs ?? [] })))
if (tests.length !== 21 || tests.some((test) => test.status !== "Success")) throw new Error("Expected all 21 explicit cases to pass")
if (!e2e.localAnvilOnly || !e2e.snapshotRestored || e2e.publicChainTransactionsBroadcast !== 0 || e2e.receipts.length !== 8) throw new Error("Incomplete local transaction evidence")
const summary = {
  observedAt: new Date().toISOString(),
  fixedBlock: environment.blockNumber,
  fixedBlockHash: environment.blockHash,
  publicChainTransactionsBroadcast: 0,
  total: tests.length,
  passed: tests.filter((test) => test.status === "Success").length,
  failed: tests.filter((test) => test.status !== "Success").length,
  skipped: 0,
  groups: Object.entries(suites).map(([suite, result]) => ({ suite, cases: Object.keys(result.test_results).length })),
  independentApplicationTransactions: { finalRunTransactions: e2e.receipts.length, behaviorCases: 5, perGuardianGasLimit: e2e.perGuardianTransactionGasLimit, snapshotRestored: e2e.snapshotRestored, evidence: "e2e-transactions.json" },
  tests,
  interpretation: "Measured deployed-protocol compatibility and laboratory Guardian authorization at the fixed fork block; not an audit or a future-upgrade guarantee.",
}
await Bun.write("results/summary.json", JSON.stringify(summary, null, 2) + "\n")
console.log(JSON.stringify({ total: summary.total, passed: summary.passed, failed: summary.failed, groups: summary.groups }))
