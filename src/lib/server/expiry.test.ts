import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let root: string;
let getDb: typeof import("./db").getDb;
let getShareRow: typeof import("./db").getShareRow;
let runCleanup: typeof import("./shares").runCleanup;

const expiredId = "A".repeat(22);
const activeId = "B".repeat(22);
const now = Date.now();

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "shafile-expiry-"));
  vi.stubEnv("SHAFILE_DATA_DIR", root);
  vi.stubEnv("TICKET_SECRET", "test-ticket-secret");
  vi.stubEnv("IP_HASH_SECRET", "test-ip-secret");
  vi.resetModules();

  ({ getDb, getShareRow } = await import("./db"));
  ({ runCleanup } = await import("./shares"));

  const db = getDb();
  db.prepare(
    `INSERT INTO shares (
      id, kind, status, created_at, start_at, expires_at, views,
      manage_token_hash, blob_bytes
    ) VALUES (?, 'file', 'ready', ?, ?, ?, 0, ?, ?)`,
  ).run(
    expiredId,
    now - 2 * 60 * 60 * 1000,
    now - 2 * 60 * 60 * 1000,
    now - 1000,
    new Uint8Array(32),
    1024,
  );
  db.prepare(
    `INSERT INTO shares (
      id, kind, status, created_at, start_at, expires_at, views,
      manage_token_hash, blob_bytes
    ) VALUES (?, 'file', 'ready', ?, ?, ?, 0, ?, ?)`,
  ).run(
    activeId,
    now - 1000,
    now - 1000,
    now + 60 * 60 * 1000,
    new Uint8Array(32),
    2048,
  );

  await mkdir(join(root, "blobs", expiredId, "parts"), { recursive: true });
  await mkdir(join(root, "blobs", activeId, "parts"), { recursive: true });
  await writeFile(join(root, "blobs", expiredId, "header.bin"), "expired");
  await writeFile(join(root, "blobs", activeId, "header.bin"), "active");
});

afterAll(async () => {
  getDb().close();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true }).catch(() => undefined);
});

describe("expired share cleanup", () => {
  it("deletes the ciphertext of expired files during the cleanup sweep", async () => {
    await runCleanup(now);

    const expired = getShareRow(expiredId);
    expect(expired?.status).toBe("expired");
    expect(expired?.blob_bytes).toBe(0);
    await expect(stat(join(root, "blobs", expiredId))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const active = getShareRow(activeId);
    expect(active?.status).toBe("ready");
    expect(active?.blob_bytes).toBe(2048);
    await expect(stat(join(root, "blobs", activeId, "header.bin"))).resolves.toBeTruthy();
  });
});
