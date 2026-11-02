import { Database } from "bun:sqlite";

export type RelayStatus = "received" | "simulated" | "submitted" | "confirmed" | "reverted" | "expired" | "unknown";

export interface RequestRecord {
  digest: string;
  requestJson: string;
  status: RelayStatus;
  transactionHash: string | null;
  blockNumber: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

interface RequestRow {
  digest: string;
  request_json: string;
  status: RelayStatus;
  transaction_hash: string | null;
  block_number: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export class RelayStore {
  private readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        digest TEXT PRIMARY KEY,
        request_json TEXT NOT NULL,
        status TEXT NOT NULL,
        transaction_hash TEXT,
        block_number TEXT,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  get(digest: string): RequestRecord | null {
    const row = this.db.query<RequestRow, [string]>("SELECT * FROM requests WHERE digest = ?").get(digest);
    return row ? mapRow(row) : null;
  }

  create(digest: string, requestJson: string): RequestRecord {
    const now = new Date().toISOString();
    this.db
      .query("INSERT OR IGNORE INTO requests (digest, request_json, status, created_at, updated_at) VALUES (?, ?, 'received', ?, ?)")
      .run(digest, requestJson, now, now);
    const record = this.get(digest);
    if (!record) throw new Error("failed to create request record");
    return record;
  }

  update(
    digest: string,
    patch: Partial<Pick<RequestRecord, "status" | "transactionHash" | "blockNumber" | "error">> & { incrementAttempts?: boolean },
  ): RequestRecord {
    const current = this.get(digest);
    if (!current) throw new Error(`unknown digest ${digest}`);
    const next = {
      status: patch.status ?? current.status,
      transactionHash: patch.transactionHash === undefined ? current.transactionHash : patch.transactionHash,
      blockNumber: patch.blockNumber === undefined ? current.blockNumber : patch.blockNumber,
      error: patch.error === undefined ? current.error : patch.error,
      attempts: current.attempts + (patch.incrementAttempts ? 1 : 0),
      updatedAt: new Date().toISOString(),
    };
    this.db
      .query("UPDATE requests SET status = ?, transaction_hash = ?, block_number = ?, error = ?, attempts = ?, updated_at = ? WHERE digest = ?")
      .run(next.status, next.transactionHash, next.blockNumber, next.error, next.attempts, next.updatedAt, digest);
    return this.get(digest)!;
  }

  listByStatuses(statuses: readonly RelayStatus[]): RequestRecord[] {
    if (statuses.length === 0) return [];
    const placeholders = statuses.map(() => "?").join(",");
    const rows = this.db
      .query<RequestRow, string[]>(`SELECT * FROM requests WHERE status IN (${placeholders}) ORDER BY created_at ASC`)
      .all(...statuses);
    return rows.map(mapRow);
  }

  snapshot(): { total: number; byStatus: Record<string, number>; lastUpdatedAt: string | null } {
    const rows = this.db.query<{ status: string; count: number }, []>("SELECT status, COUNT(*) AS count FROM requests GROUP BY status").all();
    const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.count]));
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const last = this.db.query<{ updated_at: string }, []>("SELECT updated_at FROM requests ORDER BY updated_at DESC LIMIT 1").get();
    return { total, byStatus, lastUpdatedAt: last?.updated_at ?? null };
  }

  close(): void {
    this.db.close();
  }
}

function mapRow(row: RequestRow): RequestRecord {
  return {
    digest: row.digest,
    requestJson: row.request_json,
    status: row.status,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
