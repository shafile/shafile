import type { DbClient } from "./db-client";
import { isCloudflareRuntime } from "./runtime";
import type { ShareRow } from "./schema";

export type { ShareRow, ShareStatus } from "./schema";

const globalForDbClient = globalThis as unknown as {
  __shafileDbClient?: Promise<DbClient>;
};

export function getDb(): Promise<DbClient> {
  if (!globalForDbClient.__shafileDbClient) {
    globalForDbClient.__shafileDbClient = isCloudflareRuntime()
      ? import("./db.cloudflare").then((module) => module.cloudflareDbClient)
      : import("./db.node").then((module) => module.nodeDbClient);
  }
  return globalForDbClient.__shafileDbClient;
}

export async function getShareRow(id: string): Promise<ShareRow | null> {
  const db = await getDb();
  return db.get<ShareRow>("SELECT * FROM shares WHERE id = ?", [id]);
}

export async function closeDbForTests(): Promise<void> {
  if (isCloudflareRuntime()) return;
  const dbNode = await import("./db.node");
  dbNode.closeNodeDbForTests();
  globalForDbClient.__shafileDbClient = undefined;
}
