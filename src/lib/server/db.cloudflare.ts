import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SCHEMA } from "./schema";
import type { DbClient, DbStatement, SqlValue } from "./db-client";

type D1DatabaseLike = {
  prepare(sql: string): {
    bind(...values: SqlValue[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
      run(): Promise<{ meta?: { changes?: number }; changes?: number }>;
    };
    run(): Promise<{ meta?: { changes?: number }; changes?: number }>;
  };
  batch(
    statements: unknown[],
  ): Promise<{ meta?: { changes?: number }; changes?: number }[]>;
  exec(sql: string): Promise<unknown>;
};

type CloudflareAppEnv = {
  DB: D1DatabaseLike;
};

const globalForD1 = globalThis as unknown as {
  __shafileD1Ready?: Promise<D1DatabaseLike>;
};

function normalizeValue(value: unknown): unknown {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return value;
}

function normalizeRow<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    output[key] = normalizeValue(value);
  }
  return output as T;
}

async function getD1(): Promise<D1DatabaseLike> {
  const context = await getCloudflareContext({ async: true });
  const env = context.env as CloudflareAppEnv;
  if (!env.DB) throw new Error("D1 binding DB is missing");
  return env.DB;
}

function readyDatabase(): Promise<D1DatabaseLike> {
  if (!globalForD1.__shafileD1Ready) {
    globalForD1.__shafileD1Ready = (async () => {
      const db = await getD1();
      for (const statement of SCHEMA.split(";")) {
        const sql = statement.trim();
        if (sql) await db.prepare(sql).run();
      }

      try {
        await db
          .prepare("ALTER TABLE shares ADD COLUMN telegram_user_hash BLOB")
          .run();
      } catch (error) {
        if (!String(error).toLowerCase().includes("duplicate column name")) {
          throw error;
        }
      }
      await db
        .prepare(
          "CREATE INDEX IF NOT EXISTS idx_shares_telegram_user ON shares(telegram_user_hash, created_at)",
        )
        .run();

      return db;
    })();
  }
  return globalForD1.__shafileD1Ready;
}

function prepared(db: D1DatabaseLike, sql: string, params: SqlValue[]) {
  return db.prepare(sql).bind(...params);
}

export const cloudflareDbClient: DbClient = {
  async get<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    const db = await readyDatabase();
    const row = await prepared(db, sql, params).first<T>();
    return row ? normalizeRow(row) : null;
  },

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const db = await readyDatabase();
    const result = await prepared(db, sql, params).all<T>();
    return result.results.map((row) => normalizeRow(row));
  },

  async run(sql: string, params: SqlValue[] = []): Promise<{ changes: number }> {
    const db = await readyDatabase();
    const result = await prepared(db, sql, params).run();
    return {
      changes: Number(result.meta?.changes ?? result.changes ?? 0),
    };
  },

  async batch(statements: DbStatement[]): Promise<void> {
    const db = await readyDatabase();
    const preparedStatements = statements.map((item) =>
      prepared(db, item.sql, item.params ?? []),
    );
    await db.batch(preparedStatements);
  },
};
