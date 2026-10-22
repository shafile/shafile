export type SqlValue = string | number | null | Uint8Array;

export type DbStatement = {
  sql: string;
  params?: SqlValue[];
};

export interface DbClient {
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  batch(statements: DbStatement[]): Promise<void>;
}
