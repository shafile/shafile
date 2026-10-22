import { getDb, getShareRow, withTransaction, type ShareRow } from "./db";
import { AppError } from "./http";
import { verifyTokenHash } from "./tokens";
import {
  deleteShareBlobs,
  deleteUploadTemp,
} from "./storage";
import {
  BURN_GRACE_MS,
  REVOKED_GRACE_MS,
  TOMBSTONE_TTL_MS,
} from "@/lib/shared/limits";
import type {
  PasswordMeta,
  ShareMeta,
  ShareStatusView,
  LookupResult,
} from "@/lib/shared/types";
import type { KdfParams } from "@/lib/client/crypto";

function parseKdf(value: string | null): KdfParams {
  if (!value) {
    return {
      alg: "argon2id",
      memorySize: 65536,
      iterations: 3,
      parallelism: 1,
      hashLength: 32,
      version: 1,
    };
  }
  try {
    return JSON.parse(value) as KdfParams;
  } catch {
    throw new AppError("INTERNAL_ERROR", 500);
  }
}

export function getPasswordMeta(row: ShareRow): PasswordMeta | null {
  if (
    !row.password_verifier ||
    !row.password_salt ||
    !row.wrapped_key ||
    !row.wrap_nonce
  ) {
    return null;
  }
  return {
    salt: Buffer.from(row.password_salt).toString("base64url"),
    wrappedKey: Buffer.from(row.wrapped_key).toString("base64url"),
    wrapNonce: Buffer.from(row.wrap_nonce).toString("base64url"),
    kdf: parseKdf(row.kdf_params),
  };
}

export function deriveStatus(row: ShareRow, now = Date.now()): ShareStatusView {
  if (row.status === "revoked") return "revoked";
  if (row.status === "burned") return "burned";
  if (row.status === "expired") return "expired";
  if (row.expires_at !== null && row.expires_at <= now) return "expired";
  if (row.max_views !== null && row.views >= row.max_views) return "exhausted";
  if (row.status === "draft") return "draft";
  if (row.start_at !== null && row.start_at > now) return "scheduled";
  return "ready";
}

export function toShareMeta(row: ShareRow, now = Date.now()): ShareMeta {
  const status = deriveStatus(row, now);
  return {
    id: row.id,
    kind: row.kind,
    status,
    createdAt: row.created_at,
    startAt: row.start_at,
    expiresAt: row.expires_at,
    maxViews: row.max_views,
    views: row.views,
    remainingViews:
      row.max_views === null ? null : Math.max(0, row.max_views - row.views),
    hasPassword: Boolean(row.password_verifier),
    password: getPasswordMeta(row),
    chunkSize: row.chunk_size,
    chunkCount: row.chunk_count,
    serverNow: now,
  };
}

export function assertAccessible(row: ShareRow, now = Date.now()): void {
  switch (deriveStatus(row, now)) {
    case "draft":
      throw new AppError("SHARE_NOT_READY", 409);
    case "scheduled":
      throw new AppError("NOT_YET_ACTIVE", 403);
    case "expired":
      throw new AppError("SHARE_EXPIRED", 410);
    case "revoked":
      throw new AppError("SHARE_REVOKED", 410);
    case "burned":
    case "exhausted":
      throw new AppError("SHARE_EXHAUSTED", 410);
    case "ready":
      return;
  }
}

export function requireShare(id: string): ShareRow {
  const row = getShareRow(id);
  if (!row) throw new AppError("SHARE_NOT_FOUND", 404);
  return row;
}

type ConsumeResult = { views: number; maxViews: number | null };

export function consumeView(id: string, now = Date.now()): ConsumeResult {
  return withTransaction(() => {
    const db = getDb();
    const burnAt = now + BURN_GRACE_MS;
    const result = db
      .prepare(
        `UPDATE shares
         SET views = views + 1,
             burn_at = CASE
               WHEN max_views IS NOT NULL AND views + 1 >= max_views THEN ?
               ELSE burn_at
             END
         WHERE id = ?
           AND status = 'ready'
           AND (start_at IS NULL OR start_at <= ?)
           AND (expires_at IS NULL OR expires_at > ?)
           AND (max_views IS NULL OR views < max_views)`,
      )
      .run(burnAt, id, now, now);

    if (Number(result.changes) !== 1) {
      const row = getShareRow(id);
      if (!row) throw new AppError("SHARE_NOT_FOUND", 404);
      assertAccessible(row, now);
      throw new AppError("SHARE_EXHAUSTED", 410);
    }

    const updated = db
      .prepare("SELECT views, max_views, burn_at FROM shares WHERE id = ?")
      .get(id) as { views: number; max_views: number | null; burn_at: number | null };
    return { views: updated.views, maxViews: updated.max_views };
  });
}

const globalForActive = globalThis as unknown as {
  __shafileActive?: Map<string, number>;
};

function activeStreams(): Map<string, number> {
  if (!globalForActive.__shafileActive) {
    globalForActive.__shafileActive = new Map();
  }
  return globalForActive.__shafileActive;
}

export function beginActiveStream(id: string): void {
  const map = activeStreams();
  map.set(id, (map.get(id) ?? 0) + 1);
}

export async function endActiveStream(id: string): Promise<void> {
  const map = activeStreams();
  const next = (map.get(id) ?? 1) - 1;
  if (next <= 0) map.delete(id);
  else map.set(id, next);
  if (next <= 0) {
    try {
      await maybePurge(id);
    } catch (error) {
      console.error("[shafile] post-download cleanup failed", error);
    }
  }
}

export async function maybePurge(id: string): Promise<void> {
  if ((activeStreams().get(id) ?? 0) > 0) return;
  const row = getShareRow(id);
  if (!row) return;
  const status = deriveStatus(row);
  if (
    status !== "exhausted" &&
    status !== "expired" &&
    status !== "revoked" &&
    status !== "burned"
  ) {
    return;
  }

  await Promise.all([deleteShareBlobs(id), deleteUploadTemp(id)]);
  const nextStatus = status === "exhausted" ? "burned" : status;
  getDb()
    .prepare("UPDATE shares SET status = ?, blob_bytes = 0 WHERE id = ?")
    .run(nextStatus, id);
  getDb().prepare("DELETE FROM uploads WHERE share_id = ?").run(id);
}

export function revokeShare(id: string, manageToken: string): ShareRow {
  return withTransaction(() => {
    const row = requireShare(id);
    if (!verifyTokenHash(manageToken, row.manage_token_hash)) {
      throw new AppError("UNAUTHORIZED", 403);
    }
    if (row.status === "revoked") return row;
    getDb()
      .prepare("UPDATE shares SET status = 'revoked', revoked_at = ? WHERE id = ?")
      .run(Date.now(), id);
    return requireShare(id);
  });
}

export function lookupManaged(
  id: string,
  manageToken: string,
  now = Date.now(),
): LookupResult | null {
  const row = getShareRow(id);
  if (!row) return null;
  if (!verifyTokenHash(manageToken, row.manage_token_hash)) return null;
  return {
    id: row.id,
    kind: row.kind,
    status: deriveStatus(row, now),
    createdAt: row.created_at,
    startAt: row.start_at,
    expiresAt: row.expires_at,
    maxViews: row.max_views,
    views: row.views,
    hasPassword: Boolean(row.password_verifier),
  };
}

export function storageUsedBytes(): number {
  const db = getDb();
  const ready = db
    .prepare(
      "SELECT COALESCE(SUM(blob_bytes), 0) AS total FROM shares WHERE blob_bytes > 0",
    )
    .get() as { total: number };
  const pending = db
    .prepare("SELECT COALESCE(SUM(bytes), 0) AS total FROM upload_parts")
    .get() as { total: number };
  return Number(ready.total) + Number(pending.total);
}

let cleaning = false;

export async function runCleanup(now = Date.now()): Promise<void> {
  if (cleaning) return;
  cleaning = true;
  try {
    const db = getDb();
    const drafts = db
      .prepare("SELECT * FROM shares WHERE status = 'draft'")
      .all() as ShareRow[];
    for (const row of drafts) {
      if (row.created_at + 24 * 60 * 60 * 1000 < now) {
        await Promise.all([deleteShareBlobs(row.id), deleteUploadTemp(row.id)]);
        db.prepare("DELETE FROM shares WHERE id = ?").run(row.id);
      }
    }

    const pending = db
      .prepare(
        `SELECT * FROM shares
         WHERE status IN ('ready', 'revoked', 'expired', 'burned')`,
      )
      .all() as ShareRow[];

    for (const row of pending) {
      const status = deriveStatus(row, now);
      const shouldPurge =
        status === "expired" ||
        (status === "exhausted" && (row.burn_at ?? 0) <= now) ||
        (status === "revoked" &&
          (row.revoked_at ?? 0) + REVOKED_GRACE_MS <= now) ||
        status === "burned";
      if (shouldPurge) await maybePurge(row.id);

      const tombstone =
        status === "expired" || status === "revoked" || status === "burned";
      if (tombstone && row.created_at + TOMBSTONE_TTL_MS <= now) {
        await Promise.all([deleteShareBlobs(row.id), deleteUploadTemp(row.id)]);
        db.prepare("DELETE FROM shares WHERE id = ?").run(row.id);
      }
    }
  } catch (error) {
    console.error("[shafile] cleanup failed", error);
  } finally {
    cleaning = false;
  }
}
