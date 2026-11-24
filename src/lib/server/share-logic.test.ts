import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let root: string;
let getDb: typeof import("./db").getDb;
let getShareRow: typeof import("./db").getShareRow;
let closeDbForTests: typeof import("./db").closeDbForTests;
let consumeView: typeof import("./shares").consumeView;
let releaseView: typeof import("./shares").releaseView;
let beginActiveStream: typeof import("./shares").beginActiveStream;
let endActiveStream: typeof import("./shares").endActiveStream;
let savePart: typeof import("./uploads").savePart;

const soonId = "A".repeat(22);
const streamId = "B".repeat(22);
const quotaId = "C".repeat(22);
const now = Date.now();

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "shafile-share-logic-"));
  vi.stubEnv("SHAFILE_DATA_DIR", root);
  vi.stubEnv("TICKET_SECRET", "test-ticket-secret");
  vi.stubEnv("IP_HASH_SECRET", "test-ip-secret");
  vi.stubEnv("MAX_STORAGE_BYTES", "1000");
  vi.resetModules();

  ({ getDb, getShareRow, closeDbForTests } = await import("./db"));
  ({ consumeView, releaseView, beginActiveStream, endActiveStream } =
    await import("./shares"));
  ({ savePart } = await import("./uploads"));

  const db = await getDb();
  await db.run(
    `INSERT INTO shares (
      id, kind, status, created_at, start_at, expires_at, max_views, views,
      manage_token_hash, blob_bytes
    ) VALUES (?, 'text', 'ready', ?, NULL, NULL, 1, 0, ?, 100)`,
    [soonId, now, new Uint8Array(32)],
  );
  await db.run(
    `INSERT INTO shares (
      id, kind, status, created_at, start_at, expires_at, max_views, views,
      manage_token_hash, blob_bytes
    ) VALUES (?, 'file', 'ready', ?, NULL, NULL, 3, 0, ?, 100)`,
    [streamId, now, new Uint8Array(32)],
  );
  await db.run(
    `INSERT INTO shares (
      id, kind, status, created_at, start_at, expires_at, max_views, views,
      manage_token_hash, upload_token_hash, chunk_size, chunk_count, blob_bytes
    ) VALUES (?, 'file', 'draft', ?, NULL, NULL, NULL, 0, ?, ?, ?, ?, 0)`,
    [
      quotaId,
      now,
      new Uint8Array(32),
      new Uint8Array(32),
      4 * 1024 * 1024,
      10,
    ],
  );
  await db.run(
    "INSERT INTO uploads (share_id, created_at, expires_at) VALUES (?, ?, ?)",
    [quotaId, now, now + 60_000],
  );
  await db.run(
    "INSERT INTO upload_parts (upload_id, idx, bytes) VALUES (?, 0, 900)",
    [quotaId],
  );
});

afterAll(async () => {
  await closeDbForTests();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true }).catch(() => undefined);
});

describe("share view lifecycle", () => {
  it("releases a reserved view when a download never delivers data", async () => {
    await consumeView(soonId, now);
    expect((await getShareRow(soonId))?.views).toBe(1);

    await releaseView(soonId);
    const row = await getShareRow(soonId);
    expect(row?.views).toBe(0);
    expect(row?.burn_at).toBeNull();
  });

  it("keeps the active counter consistent with concurrent begin/end", async () => {
    await beginActiveStream(streamId, now);
    await beginActiveStream(streamId, now);
    await endActiveStream(streamId);

    const db = await getDb();
    const afterFirstEnd = await db.get<{ count: number }>(
      "SELECT count FROM active_streams WHERE share_id = ?",
      [streamId],
    );
    expect(afterFirstEnd?.count).toBe(1);

    await endActiveStream(streamId);
    const afterSecondEnd = await db.get<{ count: number }>(
      "SELECT count FROM active_streams WHERE share_id = ?",
      [streamId],
    );
    expect(afterSecondEnd).toBeNull();
  });
});

describe("upload storage budget", () => {
  it("rejects a part before writing when the global quota is exceeded", async () => {
    const row = await getShareRow(quotaId);
    expect(row).not.toBeNull();
    const frame = new Uint8Array(204);
    new DataView(frame.buffer).setUint32(0, 200, false);

    await expect(savePart(row!, 1, frame)).rejects.toMatchObject({
      code: "STORAGE_FULL",
    });
  });
});
