import { DatabaseSync } from "node:sqlite";
import { serverConfig } from "./config";

const globalForDb = globalThis as unknown as {
  __shafileDb?: DatabaseSync;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'file')),
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  start_at INTEGER,
  expires_at INTEGER,
  max_views INTEGER,
  views INTEGER NOT NULL DEFAULT 0,
  chunk_size INTEGER,
  chunk_count INTEGER,
  nonce_prefix BLOB,
  file_id BLOB,
  password_salt BLOB,
  password_verifier BLOB,
  wrapped_key BLOB,
  wrap_nonce BLOB,
  kdf_params TEXT,
  manage_token_hash BLOB NOT NULL,
  upload_token_hash BLOB,
  manifest_hash BLOB,
  blob_bytes INTEGER NOT NULL DEFAULT 0,
  burn_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_shares_status_expiry
  ON shares(status, expires_at);

CREATE TABLE IF NOT EXISTS uploads (
  share_id TEXT PRIMARY KEY REFERENCES shares(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS upload_parts (
  upload_id TEXT NOT NULL REFERENCES uploads(share_id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  PRIMARY KEY (upload_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_upload_parts_upload ON upload_parts(upload_id);
`;

export function getDb(): DatabaseSync {
  if (globalForDb.__shafileDb) return globalForDb.__shafileDb;

  const db = new DatabaseSync(serverConfig.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  globalForDb.__shafileDb = db;
  return db;
}

export type ShareStatus =
  | "draft"
  | "ready"
  | "revoked"
  | "expired"
  | "burned";

export type ShareRow = {
  id: string;
  kind: "text" | "file";
  status: ShareStatus;
  created_at: number;
  start_at: number | null;
  expires_at: number | null;
  max_views: number | null;
  views: number;
  chunk_size: number | null;
  chunk_count: number | null;
  nonce_prefix: Uint8Array | null;
  file_id: Uint8Array | null;
  password_salt: Uint8Array | null;
  password_verifier: Uint8Array | null;
  wrapped_key: Uint8Array | null;
  wrap_nonce: Uint8Array | null;
  kdf_params: string | null;
  manage_token_hash: Uint8Array;
  upload_token_hash: Uint8Array | null;
  manifest_hash: Uint8Array | null;
  blob_bytes: number;
  burn_at: number | null;
  revoked_at: number | null;
};

export function getShareRow(id: string): ShareRow | null {
  const row = getDb()
    .prepare("SELECT * FROM shares WHERE id = ?")
    .get(id) as ShareRow | undefined;
  return row ?? null;
}

export function withTransaction<T>(operation: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
