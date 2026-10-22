export const CHUNK_SIZE = 4 * 1024 * 1024;
export const MAX_TEXT_BYTES = 256 * 1024;
export const MAX_MANIFEST_BYTES = 64 * 1024;
export const MAX_VIEWS = 100_000;
export const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024;
export const ACCESS_TOKEN_TTL_MS = 10 * 60 * 1000;
export const BURN_GRACE_MS = 10 * 60 * 1000;
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const REVOKED_GRACE_MS = 60 * 60 * 1000;
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const PASSWORD_MIN_LENGTH = 8;

export function getMaxFileBytes(): number {
  const parsed = Number(process.env.MAX_SHARE_BYTES ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_FILE_BYTES;
}

export function getMaxStorageBytes(): number {
  const parsed = Number(process.env.MAX_STORAGE_BYTES ?? "");
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : 50 * 1024 * 1024 * 1024;
}
