export const SCHEMA = `
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
  telegram_user_hash BLOB,
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

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS active_streams (
  share_id TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_active_streams_updated
  ON active_streams(updated_at);
`;

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
  telegram_user_hash: Uint8Array | null;
  upload_token_hash: Uint8Array | null;
  manifest_hash: Uint8Array | null;
  blob_bytes: number;
  burn_at: number | null;
  revoked_at: number | null;
};
