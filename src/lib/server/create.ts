import { getDb, getShareRow, type ShareRow } from "./db";
import { AppError } from "./http";
import {
  CHUNK_SIZE,
  MAX_TEXT_BYTES,
  MAX_VIEWS,
  SHARE_ID_PATTERN,
  getMaxFileBytes,
  getMaxStorageBytes,
} from "@/lib/shared/limits";
import { base64UrlToBytes } from "@/lib/shared/encoding";
import {
  deleteShareBlobs,
  writeTextBlob,
} from "./storage";
import {
  createOpaqueToken,
  hashToken,
} from "./tokens";
import { storageUsedBytes } from "./shares";
import type { KdfParams } from "@/lib/client/crypto";

export type PasswordInput = {
  salt: string;
  verifier: string;
  wrappedKey: string;
  wrapNonce: string;
  kdf: KdfParams;
};

export type TextShareInput = {
  id: string;
  startAt: number | null;
  expiresAt: number | null;
  maxViews: number | null;
  password: PasswordInput | null;
  payload: string;
  ownerHash?: Uint8Array | null;
};

export type FileShareInput = {
  id: string;
  startAt: number | null;
  expiresAt: number | null;
  maxViews: number | null;
  password: PasswordInput | null;
  chunkSize: number;
  chunkCount: number;
  noncePrefix: string;
  fileId: string;
  ownerHash?: Uint8Array | null;
};

function decodeField(
  value: string,
  expectedLength: number,
  field: string,
): Uint8Array {
  let decoded: Uint8Array;
  try {
    decoded = base64UrlToBytes(value);
  } catch {
    throw new AppError("INVALID_REQUEST", 400, { field });
  }
  if (decoded.length !== expectedLength) {
    throw new AppError("INVALID_REQUEST", 400, { field });
  }
  return decoded;
}

function validateCommon(input: {
  id: string;
  startAt: number | null;
  expiresAt: number | null;
  maxViews: number | null;
  password: PasswordInput | null;
}): {
  startAt: number;
  expiresAt: number | null;
  maxViews: number | null;
  password: PasswordInput | null;
  passwordSalt: Uint8Array | null;
  passwordVerifier: Uint8Array | null;
  wrappedKey: Uint8Array | null;
  wrapNonce: Uint8Array | null;
  kdfJson: string | null;
} {
  if (!SHARE_ID_PATTERN.test(input.id)) {
    throw new AppError("INVALID_REQUEST", 400, { field: "id" });
  }

  const now = Date.now();
  const requestedStart = input.startAt;
  const startAt =
    requestedStart === null || requestedStart <= now + 5000
      ? now - 5000
      : requestedStart;
  if (startAt > now + 366 * 24 * 60 * 60 * 1000) {
    throw new AppError("INVALID_SCHEDULE", 400);
  }
  if (input.expiresAt !== null && input.expiresAt <= Math.max(now, startAt)) {
    throw new AppError("INVALID_SCHEDULE", 400);
  }
  if (
    input.maxViews !== null &&
    (!Number.isInteger(input.maxViews) ||
      input.maxViews < 1 ||
      input.maxViews > MAX_VIEWS)
  ) {
    throw new AppError("INVALID_REQUEST", 400, { field: "maxViews" });
  }

  let passwordSalt: Uint8Array | null = null;
  let passwordVerifier: Uint8Array | null = null;
  let wrappedKey: Uint8Array | null = null;
  let wrapNonce: Uint8Array | null = null;
  let kdfJson: string | null = null;

  if (input.password) {
    passwordSalt = decodeField(input.password.salt, 16, "password.salt");
    passwordVerifier = decodeField(
      input.password.verifier,
      32,
      "password.verifier",
    );
    wrappedKey = decodeField(input.password.wrappedKey, 48, "password.wrappedKey");
    wrapNonce = decodeField(input.password.wrapNonce, 12, "password.wrapNonce");
    const kdf = input.password.kdf;
    if (
      kdf.alg !== "argon2id" ||
      kdf.version !== 1 ||
      kdf.hashLength !== 32 ||
      kdf.memorySize < 16_384 ||
      kdf.memorySize > 262_144 ||
      kdf.iterations < 1 ||
      kdf.iterations > 10 ||
      kdf.parallelism < 1 ||
      kdf.parallelism > 4
    ) {
      throw new AppError("INVALID_REQUEST", 400, { field: "password.kdf" });
    }
    kdfJson = JSON.stringify(kdf);
  }

  return {
    startAt,
    expiresAt: input.expiresAt,
    maxViews: input.maxViews,
    password: input.password,
    passwordSalt,
    passwordVerifier,
    wrappedKey,
    wrapNonce,
    kdfJson,
  };
}

export async function createTextShare(input: TextShareInput): Promise<{
  row: ShareRow;
  manageToken: string;
}> {
  const common = validateCommon(input);
  if (await getShareRow(input.id)) {
    throw new AppError("SHARE_ID_CONFLICT", 409);
  }

  let payload: Uint8Array;
  try {
    payload = base64UrlToBytes(input.payload);
  } catch {
    throw new AppError("INVALID_REQUEST", 400, { field: "payload" });
  }
  if (payload.length < 5 + 12 + 16) throw new AppError("EMPTY_TEXT", 400);
  if (payload.length > MAX_TEXT_BYTES + 64) {
    throw new AppError("TEXT_TOO_LARGE", 413);
  }
  if ((await storageUsedBytes()) + payload.length > getMaxStorageBytes()) {
    throw new AppError("STORAGE_FULL", 507);
  }

  const manageToken = createOpaqueToken();
  const now = Date.now();
  const db = await getDb();

  await writeTextBlob(input.id, payload);

  try {
    await db.run(
      `INSERT INTO shares (
        id, kind, status, created_at, start_at, expires_at, max_views, views,
        password_salt, password_verifier, wrapped_key, wrap_nonce, kdf_params,
        manage_token_hash, telegram_user_hash, blob_bytes
      ) VALUES (?, 'text', 'ready', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        now,
        common.startAt,
        common.expiresAt,
        common.maxViews,
        common.passwordSalt,
        common.passwordVerifier,
        common.wrappedKey,
        common.wrapNonce,
        common.kdfJson,
        hashToken(manageToken),
        input.ownerHash ?? null,
        payload.length,
      ],
    );
  } catch (error) {
    if (!(await getShareRow(input.id))) await deleteShareBlobs(input.id);
    throw error;
  }

  return { row: (await getShareRow(input.id))!, manageToken };
}

export async function createFileShare(input: FileShareInput): Promise<{
  row: ShareRow;
  manageToken: string;
  uploadToken: string;
}> {
  const common = validateCommon(input);
  if (await getShareRow(input.id)) {
    throw new AppError("SHARE_ID_CONFLICT", 409);
  }
  if (!Number.isInteger(input.chunkSize) || input.chunkSize !== CHUNK_SIZE) {
    throw new AppError("INVALID_REQUEST", 400, { field: "chunkSize" });
  }
  const maxChunks = Math.ceil(getMaxFileBytes() / CHUNK_SIZE) + 1;
  if (
    !Number.isInteger(input.chunkCount) ||
    input.chunkCount < 1 ||
    input.chunkCount > maxChunks
  ) {
    throw new AppError("FILE_TOO_LARGE", 413);
  }

  let noncePrefix: Uint8Array;
  let fileId: Uint8Array;
  try {
    noncePrefix = base64UrlToBytes(input.noncePrefix);
    fileId = base64UrlToBytes(input.fileId);
  } catch {
    throw new AppError("INVALID_REQUEST", 400);
  }
  if (noncePrefix.length !== 8 || fileId.length !== 16) {
    throw new AppError("INVALID_REQUEST", 400);
  }

  const manageToken = createOpaqueToken();
  const uploadToken = createOpaqueToken();
  const now = Date.now();
  const db = await getDb();

  await db.batch([
    {
      sql: `INSERT INTO shares (
        id, kind, status, created_at, start_at, expires_at, max_views, views,
        chunk_size, chunk_count, nonce_prefix, file_id,
        password_salt, password_verifier, wrapped_key, wrap_nonce, kdf_params,
        manage_token_hash, telegram_user_hash, upload_token_hash, blob_bytes
      ) VALUES (?, 'file', 'draft', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      params: [
        input.id,
        now,
        common.startAt,
        common.expiresAt,
        common.maxViews,
        input.chunkSize,
        input.chunkCount,
        noncePrefix,
        fileId,
        common.passwordSalt,
        common.passwordVerifier,
        common.wrappedKey,
        common.wrapNonce,
        common.kdfJson,
        hashToken(manageToken),
        input.ownerHash ?? null,
        hashToken(uploadToken),
      ],
    },
    {
      sql: "INSERT INTO uploads (share_id, created_at, expires_at) VALUES (?, ?, ?)",
      params: [input.id, now, now + 24 * 60 * 60 * 1000],
    },
  ]);

  return {
    row: (await getShareRow(input.id))!,
    manageToken,
    uploadToken,
  };
}