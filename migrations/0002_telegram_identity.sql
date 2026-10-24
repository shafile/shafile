ALTER TABLE shares ADD COLUMN telegram_user_hash BLOB;

CREATE INDEX IF NOT EXISTS idx_shares_telegram_user
  ON shares(telegram_user_hash, created_at);
