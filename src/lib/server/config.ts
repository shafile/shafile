import { createHmac, randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { isCloudflareRuntime } from "./runtime";

const dataDir = isCloudflareRuntime()
  ? "/tmp/shafile"
  : process.env.SHAFILE_DATA_DIR
    ? resolve(/* turbopackIgnore: true */ process.env.SHAFILE_DATA_DIR)
    : join(process.cwd(), "data");

export const serverConfig = {
  dataDir,
  dbPath: isCloudflareRuntime()
    ? join(dataDir, "shafile.db")
    : process.env.DATABASE_PATH
      ? resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH)
      : join(dataDir, "shafile.db"),
  blobDir: isCloudflareRuntime()
    ? join(dataDir, "blobs")
    : process.env.BLOB_DIR
      ? resolve(/* turbopackIgnore: true */ process.env.BLOB_DIR)
      : join(dataDir, "blobs"),
  tmpDir: join(dataDir, "tmp"),
  trustProxy: process.env.TRUST_PROXY === "true",
};

type NodeFs = typeof import("node:fs");

function nodeFs(): NodeFs {
  const fs = process.getBuiltinModule("node:fs") as NodeFs | undefined;
  if (!fs) throw new Error("node:fs is unavailable");
  return fs;
}

export function ensureDataDirs(): void {
  if (isCloudflareRuntime()) return;
  const { mkdirSync } = nodeFs();
  for (const directory of [
    serverConfig.dataDir,
    serverConfig.blobDir,
    serverConfig.tmpDir,
  ]) {
    mkdirSync(directory, { recursive: true });
  }
}

type Secrets = {
  ticketSecret: string;
  ipHashSecret: string;
  telegramSessionSecret: string;
  telegramHashSecret: string;
};

function deriveSecret(seed: string, label: string): string {
  return createHmac("sha256", seed)
    .update(`shafile/v1/${label}`)
    .digest("base64url");
}

const globalForSecrets = globalThis as unknown as {
  __shafileSecrets?: Secrets;
};

export function getSecrets(): Secrets {
  if (globalForSecrets.__shafileSecrets) return globalForSecrets.__shafileSecrets;

  const envTicket = process.env.TICKET_SECRET;
  const envIp = process.env.IP_HASH_SECRET;
  const envSession = process.env.TELEGRAM_SESSION_SECRET;
  const envHash = process.env.TELEGRAM_HASH_SECRET;
  if (envTicket && envIp) {
    globalForSecrets.__shafileSecrets = {
      ticketSecret: envTicket,
      ipHashSecret: envIp,
      telegramSessionSecret:
        envSession ?? deriveSecret(envTicket, "telegram-session"),
      telegramHashSecret:
        envHash ?? deriveSecret(envTicket, "telegram-user-hash"),
    };
    return globalForSecrets.__shafileSecrets;
  }

  if (isCloudflareRuntime()) {
    throw new Error("TICKET_SECRET and IP_HASH_SECRET are required on Cloudflare");
  }

  ensureDataDirs();
  const { existsSync, readFileSync, writeFileSync } = nodeFs();
  const secretPath = join(serverConfig.dataDir, ".secrets.json");
  let fileSecrets: Partial<Secrets> = {};
  if (existsSync(secretPath)) {
    fileSecrets = JSON.parse(readFileSync(secretPath, "utf8")) as Partial<Secrets>;
  }

  const ticketSecret =
    envTicket ?? fileSecrets.ticketSecret ?? randomBytes(32).toString("base64url");
  const ipHashSecret =
    envIp ?? fileSecrets.ipHashSecret ?? randomBytes(32).toString("base64url");
  const telegramSessionSecret =
    envSession ??
    fileSecrets.telegramSessionSecret ??
    deriveSecret(ticketSecret, "telegram-session");
  const telegramHashSecret =
    envHash ??
    fileSecrets.telegramHashSecret ??
    deriveSecret(ticketSecret, "telegram-user-hash");

  const secrets: Secrets = {
    ticketSecret,
    ipHashSecret,
    telegramSessionSecret,
    telegramHashSecret,
  };

  const shouldWrite =
    !existsSync(secretPath) ||
    fileSecrets.telegramSessionSecret !== telegramSessionSecret ||
    fileSecrets.telegramHashSecret !== telegramHashSecret;
  if (shouldWrite) {
    writeFileSync(secretPath, JSON.stringify(secrets, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  globalForSecrets.__shafileSecrets = secrets;
  return secrets;
}