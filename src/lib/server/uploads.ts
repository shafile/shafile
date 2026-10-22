import { createHash } from "node:crypto";
import {
  CHUNK_SIZE,
  MAX_MANIFEST_BYTES,
  getMaxFileBytes,
  getMaxStorageBytes,
} from "@/lib/shared/limits";
import { readU32be } from "@/lib/shared/encoding";
import { getDb, getShareRow, withTransaction, type ShareRow } from "./db";
import { AppError } from "./http";
import {
  fileExists,
  fileSize,
  promoteUpload,
  tempManifestPath,
  tempPartPath,
  writePart,
  writeTempHeader,
  writeTempManifest,
} from "./storage";
import { storageUsedBytes } from "./shares";
import { verifyTokenHash } from "./tokens";

export function requireUploadSession(
  shareId: string,
  token: string,
  allowReady = false,
): ShareRow {
  const row = getShareRow(shareId);
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

  try {
    withTransaction(() => {
      getDb()
        .prepare(
          `INSERT INTO upload_parts (upload_id, idx, bytes)
           VALUES (?, ?, ?)
           ON CONFLICT(upload_id, idx) DO UPDATE SET bytes = excluded.bytes`,
        )
        .run(row.id, index, body.length);

      const sizes = getDb()
        .prepare(
          "SELECT COALESCE(SUM(bytes), 0) AS total FROM upload_parts WHERE upload_id = ?",
        )
        .get(row.id) as { total: number };

      const allowance =
        getMaxFileBytes() + (row.chunk_count ?? 0) * 20 + 4096;
      if (Number(sizes.total) > allowance) {
        throw new AppError("FILE_TOO_LARGE", 413);
      }
    });
  } catch (error) {
    throw error;
  }
}

export function uploadedIndices(shareId: string): number[] {
  const rows = getDb()
    .prepare("SELECT idx FROM upload_parts WHERE upload_id = ? ORDER BY idx")
    .all(shareId) as { idx: number }[];
  return rows.map((row) => row.idx);
}

export function uploadStatus(row: ShareRow): {
  uploaded: number[];
  chunkCount: number;
  ready: boolean;
} {
  return {
    uploaded: uploadedIndices(row.id),
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
  const header = Buffer.alloc(32);
  header.write("SHF1", 0, "ascii");
  header.writeUInt32BE(row.chunk_size, 4);
  Buffer.from(row.nonce_prefix).copy(header, 8);
  Buffer.from(row.file_id).copy(header, 16);
  return new Uint8Array(header);
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
  if (row.status === "ready") {
    // Finalization is immutable; a retry after a lost response is a no-op.
    return;
  }
  if (row.status !== "draft") throw new AppError("SHARE_NOT_READY", 409);

  validateManifestFrame(manifest);
  if (row.chunk_count === null) throw new AppError("SHARE_NOT_READY", 409);

  const parts = getDb()
    .prepare(
      "SELECT idx, bytes FROM upload_parts WHERE upload_id = ? ORDER BY idx",
    )
    .all(row.id) as { idx: number; bytes: number }[];

  if (parts.length !== row.chunk_count) {
    throw new AppError("UPLOAD_INCOMPLETE", 409);
  }
  for (let index = 0; index < row.chunk_count; index += 1) {
    if (parts[index]?.idx !== index) throw new AppError("UPLOAD_INCOMPLETE", 409);
    if (!(await fileExists(tempPartPath(row.id, index)))) {
      throw new AppError("UPLOAD_INCOMPLETE", 409);
    }
  }

  const header = buildHeader(row);
  await writeTempHeader(row.id, header);
  await writeTempManifest(row.id, manifest);

  const manifestBytes = await fileSize(tempManifestPath(row.id));
  if (manifestBytes === null) throw new AppError("UPLOAD_FAILED", 500);

  if (
    storageUsedBytes() + 32 + manifestBytes > getMaxStorageBytes()
  ) {
    throw new AppError("STORAGE_FULL", 507);
  }

  await promoteUpload(row.id);

  const blobBytes =
    32 + parts.reduce((sum, part) => sum + Number(part.bytes), 0) + manifestBytes;
  const hash = new Uint8Array(
    createHash("sha256").update(manifest).digest(),
  );

  getDb()
    .prepare(
      `UPDATE shares
       SET status = 'ready', manifest_hash = ?, blob_bytes = ?
       WHERE id = ? AND status = 'draft'`,
    )
    .run(hash, blobBytes, row.id);
  getDb().prepare("DELETE FROM uploads WHERE share_id = ?").run(row.id);
}
