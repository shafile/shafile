import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";

const dataDir = process.env.SHAFILE_DATA_DIR
  ? resolve(/* turbopackIgnore: true */ process.env.SHAFILE_DATA_DIR)
  : join(process.cwd(), "data");

export const serverConfig = {
  dataDir,
  dbPath: process.env.DATABASE_PATH
    ? resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH)
    : join(dataDir, "shafile.db"),
  blobDir: process.env.BLOB_DIR
    ? resolve(/* turbopackIgnore: true */ process.env.BLOB_DIR)
    : join(dataDir, "blobs"),
  tmpDir: join(dataDir, "tmp"),
  trustProxy: process.env.TRUST_PROXY === "true",
};

export function ensureDataDirs(): void {
  for (const directory of [serverConfig.dataDir, serverConfig.blobDir, serverConfig.tmpDir]) {
    mkdirSync(directory, { recursive: true });
  }
}

type Secrets = {
  ticketSecret: string;
  ipHashSecret: string;
};

const globalForSecrets = globalThis as unknown as {
  __shafileSecrets?: Secrets;
};

export function getSecrets(): Secrets {
  if (globalForSecrets.__shafileSecrets) return globalForSecrets.__shafileSecrets;

  const envTicket = process.env.TICKET_SECRET;
  const envIp = process.env.IP_HASH_SECRET;
  if (envTicket && envIp) {
    globalForSecrets.__shafileSecrets = {
      ticketSecret: envTicket,
      ipHashSecret: envIp,
    };
    return globalForSecrets.__shafileSecrets;
  }

  ensureDataDirs();
  const secretPath = join(serverConfig.dataDir, ".secrets.json");
  let fileSecrets: Partial<Secrets> = {};
  if (existsSync(secretPath)) {
    fileSecrets = JSON.parse(readFileSync(secretPath, "utf8")) as Partial<Secrets>;
  }

  const secrets: Secrets = {
    ticketSecret:
      envTicket ?? fileSecrets.ticketSecret ?? randomBytes(32).toString("base64url"),
    ipHashSecret:
      envIp ?? fileSecrets.ipHashSecret ?? randomBytes(32).toString("base64url"),
  };

  if (!existsSync(secretPath)) {
    writeFileSync(secretPath, JSON.stringify(secrets, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  globalForSecrets.__shafileSecrets = secrets;
  return secrets;
}
