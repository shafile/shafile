import { createHash } from "node:crypto";
import {
  CHUNK_SIZE,
  MAX_MANIFEST_BYTES,
  getMaxFileBytes,
  getMaxStorageBytes,
} from "@/lib/shared/limits";
import { readU32be } from "@/lib/shared/encoding";
import { getDb, getShareRow, type ShareRow } from "./db";
import { AppError } from "./http";
import { writeHeader, writeManifest, writePart } from "./storage";
import { storageUsedBytes } from "./shares";
import { verifyTokenHash } from "./tokens";

export async function requireUploadSession(
  shareId: string,
  token: string,
  allowReady = false,
): Promise<ShareRow> {
  const row = await getShareRow(shareId);
  if (!row) throw new AppError("SHARE_NOT_FOUND", 404);
  if (!verifyTokenHash(token, row.upload_token_hash)) {
    throw new AppError("UPLOAD_TOKEN_INVALID", 401);
  }
  if (row.kind !== "file") throw new AppError("INVALID_REQUEST", 400);
  if (row.status === "ready" && allowReady) return row;
  if (row.status !== "draft") throw new AppError("SHARE_NOT_READY", 409);
  return row;
}

export async function savePart(
  row: ShareRow,
  index: number,
  body: Uint8Array,
): Promise<void> {
  if (
    row.chunk_count === null ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= row.chunk_count
  ) {
    throw new AppError("INVALID_REQUEST", 400, { field: "index" });
  }
  if (body.length < 4 + 16) throw new AppError("INVALID_REQUEST", 400);
  const length = readU32be(body, 0);
  if (length !== body.length - 4) throw new AppError("INVALID_REQUEST", 400);
  const chunkSize = row.chunk_size ?? CHUNK_SIZE;
  if (length > chunkSize + 16) throw new AppError("INVALID_REQUEST", 413);

  await writePart(row.id, index, body);

  const db = await getDb();
  await db.run(
    `INSERT INTO upload_parts (upload_id, idx, bytes)
     VALUES (?, ?, ?)
     ON CONFLICT(upload_id, idx) DO UPDATE SET bytes = excluded.bytes`,
    [row.id, index, body.length],
  );

  const sizes = await db.get<{ total: number }>(
    "SELECT COALESCE(SUM(bytes), 0) AS total FROM upload_parts WHERE upload_id = ?",
    [row.id],
  );
  const allowance = getMaxFileBytes() + (row.chunk_count ?? 0) * 20 + 4096;
  if (Number(sizes?.total ?? 0) > allowance) {
    throw new AppError("FILE_TOO_LARGE", 413);
  }
}

export async function uploadedIndices(shareId: string): Promise<number[]> {
  const db = await getDb();
  const rows = await db.all<{ idx: number }>(
    "SELECT idx FROM upload_parts WHERE upload_id = ? ORDER BY idx",
    [shareId],
  );
  return rows.map((row) => row.idx);
}

export async function uploadStatus(row: ShareRow): Promise<{
  uploaded: number[];
  chunkCount: number;
  ready: boolean;
}> {
  return {
    uploaded: await uploadedIndices(row.id),
    chunkCount: row.chunk_count ?? 0,
    ready: row.status === "ready",
  };
}

function buildHeader(row: ShareRow): Uint8Array {
  if (
    row.chunk_size === null ||
    row.nonce_prefix === null ||
    row.file_id === null
  ) {
    throw new AppError("SHARE_NOT_READY", 409);
  }
  const header = new Uint8Array(32);
  header.set([0x53, 0x48, 0x46, 0x31], 0);
  const view = new DataView(header.buffer);
  view.setUint32(4, row.chunk_size, false);
  header.set(row.nonce_prefix, 8);
  header.set(row.file_id, 16);
  return header;
}

function validateManifestFrame(manifest: Uint8Array): void {
  if (manifest.length < 4 + 12 + 16) {
    throw new AppError("INVALID_REQUEST", 400, { field: "manifest" });
  }
  if (manifest.length > MAX_MANIFEST_BYTES) {
    throw new AppError("INVALID_REQUEST", 413, { field: "manifest" });
  }
  const length = readU32be(manifest, 0);
  if (length !== manifest.length - 4) {
    throw new AppError("INVALID_REQUEST", 400, { field: "manifest" });
  }
}

export async function finalizeUpload(
  row: ShareRow,
  manifest: Uint8Array,
): Promise<void> {
  if (row.status === "ready") return;
  if (row.status !== "draft") throw new AppError("SHARE_NOT_READY", 409);

  validateManifestFrame(manifest);
  if (row.chunk_count === null) throw new AppError("SHARE_NOT_READY", 409);

  const db = await getDb();
  const parts = await db.all<{ idx: number; bytes: number }>(
    "SELECT idx, bytes FROM upload_parts WHERE upload_id = ? ORDER BY idx",
    [row.id],
  );

  if (parts.length !== row.chunk_count) {
    throw new AppError("UPLOAD_INCOMPLETE", 409);
  }
  for (let index = 0; index < row.chunk_count; index += 1) {
    if (parts[index]?.idx !== index) throw new AppError("UPLOAD_INCOMPLETE", 409);
  }

  if ((await storageUsedBytes()) + 32 + manifest.length > getMaxStorageBytes()) {
    throw new AppError("STORAGE_FULL", 507);
  }

  const header = buildHeader(row);
  await writeHeader(row.id, header);
  await writeManifest(row.id, manifest);

  const blobBytes =
    32 + parts.reduce((sum, part) => sum + Number(part.bytes), 0) + manifest.length;
  const hash = new Uint8Array(
    createHash("sha256").update(manifest).digest(),
  );

  await db.batch([
    {
      sql: `UPDATE shares
            SET status = 'ready', manifest_hash = ?, blob_bytes = ?
            WHERE id = ? AND status = 'draft'`,
      params: [hash, blobBytes, row.id],
    },
    {
      sql: "DELETE FROM upload_parts WHERE upload_id = ?",
      params: [row.id],
    },
    {
      sql: "DELETE FROM uploads WHERE share_id = ?",
      params: [row.id],
    },
  ]);
}
