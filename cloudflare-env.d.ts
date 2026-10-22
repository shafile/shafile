import type {
  D1Database,
  Fetcher,
  R2Bucket,
} from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    BLOB_BUCKET: R2Bucket;
    TICKET_SECRET: string;
    IP_HASH_SECRET: string;
    CRON_SECRET: string;
    WORKER_SELF_REFERENCE: Fetcher;
  }
}

export {};
