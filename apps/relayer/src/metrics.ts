export interface MetricsSnapshot {
  total: number;
  byStatus: Record<string, number>;
  lastUpdatedAt: string | null;
}

export function formatPrometheusMetrics(input: {
  chainId: number;
  blockNumber: string;
  requests: MetricsSnapshot;
}): string {
  const lines: string[] = [
    "# HELP qtape_relayer_requests_total Request records by status.",
    "# TYPE qtape_relayer_requests_total counter",
  ];
  for (const status of Object.keys(input.requests.byStatus).sort()) {
    lines.push(`qtape_relayer_requests_total{status="${status}"} ${input.requests.byStatus[status] ?? 0}`);
  }
  lines.push(`qtape_relayer_requests_total{status="all"} ${input.requests.total}`);
  lines.push("# HELP qtape_relayer_block_number Last block observed by the relayer.");
  lines.push("# TYPE qtape_relayer_block_number gauge");
  lines.push(`qtape_relayer_block_number{chain_id="${input.chainId}"} ${input.blockNumber}`);
  lines.push("# HELP qtape_relayer_last_update_timestamp_seconds Unix timestamp of the last status update.");
  lines.push("# TYPE qtape_relayer_last_update_timestamp_seconds gauge");
  const timestamp = input.requests.lastUpdatedAt ? Math.floor(new Date(input.requests.lastUpdatedAt).getTime() / 1000) : 0;
  lines.push(`qtape_relayer_last_update_timestamp_seconds ${timestamp}`);
  return lines.join("\n") + "\n";
}
