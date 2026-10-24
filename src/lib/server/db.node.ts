import { serverConfig } from "./config";
import { SCHEMA } from "./schema";
import type { DbClient, DbStatement, SqlValue } from "./db-client";

type DatabaseSyncInstance = InstanceType<
  typeof import("node:sqlite").DatabaseSync
>;
type SqliteModule = typeof import("node:sqlite");

function loadSqlite(): SqliteModule {
  const sqlite = process.getBuiltinModule("node:sqlite") as
    | SqliteModule
    | undefined;
  if (!sqlite) throw new Error("node:sqlite is unavailable");
  return sqlite;
}

const globalForNodeDb = globalThis as unknown as {
  __shafileNodeDb?: DatabaseSyncInstance;
};

function migrateSchema(db: DatabaseSyncInstance): void {
  const columns = db
    .prepare("PRAGMA table_info(shares)")
    .all() as { name: string }[];
  if (!columns.some((column) => column.name === "telegram_user_hash")) {
    db.exec("ALTER TABLE shares ADD COLUMN telegram_user_hash BLOB;");
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_shares_telegram_user ON shares(telegram_user_hash, created_at);",
  );
}

function database(): DatabaseSyncInstance {
  if (globalForNodeDb.__shafileNodeDb) return globalForNodeDb.__shafileNodeDb;
  const { DatabaseSync } = loadSqlite();
  const db = new DatabaseSync(serverConfig.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  migrateSchema(db);
  globalForNodeDb.__shafileNodeDb = db;
  return db;
}

function statement(db: DatabaseSyncInstance, sql: string, params: SqlValue[] = []) {
  return db.prepare(sql).run(...params);
}

export function closeNodeDbForTests(): void {
  if (globalForNodeDb.__shafileNodeDb) {
    globalForNodeDb.__shafileNodeDb.close();
    globalForNodeDb.__shafileNodeDb = undefined;
  }
}

export const nodeDbClient: DbClient = {
  async get<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    const row = database().prepare(sql).get(...params);
    return (row as T | undefined) ?? null;
  },

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return database().prepare(sql).all(...params) as T[];
  },

  async run(sql: string, params: SqlValue[] = []): Promise<{ changes: number }> {
    const result = statement(database(), sql, params);
    return { changes: Number(result.changes) };
  },

  async batch(statements: DbStatement[]): Promise<void> {
    const db = database();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of statements) {
        db.prepare(item.sql).run(...(item.params ?? []));
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
};
