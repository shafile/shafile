import { getDb, getShareRow, type ShareRow } from "./db";
import { AppError } from "./http";
import { verifyTokenHash } from "./tokens";
import { deleteShareBlobs } from "./storage";
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
import { bytesToBase64Url } from "@/lib/shared/encoding";

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
    salt: bytesToBase64Url(row.password_salt),
    wrappedKey: bytesToBase64Url(row.wrapped_key),
    wrapNonce: bytesToBase64Url(row.wrap_nonce),
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

export async function requireShare(id: string): Promise<ShareRow> {
  const row = await getShareRow(id);
  if (!row) throw new AppError("SHARE_NOT_FOUND", 404);
  return row;
}

type ConsumeResult = { views: number; maxViews: number | null };

export async function consumeView(
  id: string,
  now = Date.now(),
): Promise<ConsumeResult> {
  const db = await getDb();
  const burnAt = now + BURN_GRACE_MS;
  const result = await db.run(
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
    [burnAt, id, now, now],
  );

  if (result.changes !== 1) {
    const row = await getShareRow(id);
    if (!row) throw new AppError("SHARE_NOT_FOUND", 404);
    assertAccessible(row, now);
    throw new AppError("SHARE_EXHAUSTED", 410);
  }

  const updated = await db.get<{
    views: number;
    max_views: number | null;
  }>("SELECT views, max_views FROM shares WHERE id = ?", [id]);
  if (!updated) throw new AppError("SHARE_NOT_FOUND", 404);
  return { views: updated.views, maxViews: updated.max_views };
}

export async function beginActiveStream(id: string, now = Date.now()): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO active_streams (share_id, count, updated_at)
     VALUES (?, 1, ?)
     ON CONFLICT(share_id) DO UPDATE SET
       count = count + 1,
       updated_at = excluded.updated_at`,
    [id, now],
  );
}

export async function endActiveStream(id: string): Promise<void> {
  const db = await getDb();
  const row = await db.get<{ count: number }>(
    "SELECT count FROM active_streams WHERE share_id = ?",
    [id],
  );
  if (!row || row.count <= 1) {
    await db.run("DELETE FROM active_streams WHERE share_id = ?", [id]);
  } else {
    await db.run(
      "UPDATE active_streams SET count = count - 1, updated_at = ? WHERE share_id = ?",
      [Date.now(), id],
    );
  }
  try {
    await maybePurge(id);
  } catch (error) {
    console.error("[shafile] post-download cleanup failed", error);
  }
}

async function hasActiveStream(id: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.get<{ count: number }>(
    "SELECT count FROM active_streams WHERE share_id = ? AND updated_at > ?",
    [id, Date.now() - 60 * 60 * 1000],
  );
  return Boolean(row && row.count > 0);
}

export async function maybePurge(id: string): Promise<boolean> {
  if (await hasActiveStream(id)) return false;
  const row = await getShareRow(id);
  if (!row) return false;
  const status = deriveStatus(row);
  if (
    status !== "exhausted" &&
    status !== "expired" &&
    status !== "revoked" &&
    status !== "burned"
  ) {
    return false;
  }

  await deleteShareBlobs(id);
  const nextStatus = status === "exhausted" ? "burned" : status;
  const db = await getDb();
  await db.run(
    "UPDATE shares SET status = ?, blob_bytes = 0 WHERE id = ?",
    [nextStatus, id],
  );
  await db.run("DELETE FROM upload_parts WHERE upload_id = ?", [id]);
  await db.run("DELETE FROM uploads WHERE share_id = ?", [id]);
  await db.run("DELETE FROM active_streams WHERE share_id = ?", [id]);
  return true;
}

export async function revokeShare(
  id: string,
  manageToken: string,
): Promise<ShareRow> {
  const row = await requireShare(id);
  if (!verifyTokenHash(manageToken, row.manage_token_hash)) {
    throw new AppError("UNAUTHORIZED", 403);
  }
  if (row.status === "revoked") return row;
  const db = await getDb();
  await db.run(
    "UPDATE shares SET status = 'revoked', revoked_at = ? WHERE id = ?",
    [Date.now(), id],
  );
  return requireShare(id);
}

export async function lookupManaged(
  id: string,
  manageToken: string,
  now = Date.now(),
): Promise<LookupResult | null> {
  const row = await getShareRow(id);
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

export async function storageUsedBytes(): Promise<number> {
  const db = await getDb();
  const ready = await db.get<{ total: number }>(
    "SELECT COALESCE(SUM(blob_bytes), 0) AS total FROM shares WHERE blob_bytes > 0",
  );
  const pending = await db.get<{ total: number }>(
    "SELECT COALESCE(SUM(bytes), 0) AS total FROM upload_parts",
  );
  return Number(ready?.total ?? 0) + Number(pending?.total ?? 0);
}

let cleaning = false;

export async function runCleanup(now = Date.now()): Promise<void> {
  if (cleaning) return;
  cleaning = true;
  try {
    const db = await getDb();
    let budget = 3;

    const drafts = await db.all<ShareRow>(
      "SELECT * FROM shares WHERE status = 'draft'",
    );
    for (const row of drafts) {
      if (budget <= 0) break;
      if (row.created_at + 24 * 60 * 60 * 1000 < now) {
        await deleteShareBlobs(row.id);
        await db.run("DELETE FROM upload_parts WHERE upload_id = ?", [row.id]);
        await db.run("DELETE FROM uploads WHERE share_id = ?", [row.id]);
        await db.run("DELETE FROM shares WHERE id = ?", [row.id]);
        budget -= 1;
      }
    }

    const pending = await db.all<ShareRow>(
      `SELECT * FROM shares
       WHERE status IN ('ready', 'revoked', 'expired', 'burned')`,
    );

    for (const row of pending) {
      if (budget <= 0) break;
      const status = deriveStatus(row, now);
      const shouldPurge =
        status === "expired" ||
        (status === "exhausted" && (row.burn_at ?? 0) <= now) ||
        (status === "revoked" &&
          (row.revoked_at ?? 0) + REVOKED_GRACE_MS <= now) ||
        status === "burned";
      if (shouldPurge) {
        const purged = await maybePurge(row.id);
        budget -= 1;
        if (purged && row.created_at + TOMBSTONE_TTL_MS <= now) {
          await deleteShareBlobs(row.id);
          await db.run("DELETE FROM upload_parts WHERE upload_id = ?", [row.id]);
          await db.run("DELETE FROM uploads WHERE share_id = ?", [row.id]);
          await db.run("DELETE FROM shares WHERE id = ?", [row.id]);
        }
        continue;
      }

      if (status === "revoked" && row.created_at + TOMBSTONE_TTL_MS <= now) {
        await deleteShareBlobs(row.id);
        await db.run("DELETE FROM upload_parts WHERE upload_id = ?", [row.id]);
        await db.run("DELETE FROM uploads WHERE share_id = ?", [row.id]);
        await db.run("DELETE FROM shares WHERE id = ?", [row.id]);
        budget -= 1;
      }
    }

    await db.run(
      "DELETE FROM active_streams WHERE updated_at < ?",
      [now - 60 * 60 * 1000],
    );
    await db.run("DELETE FROM rate_limits WHERE reset_at < ?", [
      now - 24 * 60 * 60 * 1000,
    ]);
  } catch (error) {
    console.error("[shafile] cleanup failed", error);
  } finally {
    cleaning = false;
  }
}
