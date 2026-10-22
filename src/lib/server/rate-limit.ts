import { createHmac } from "node:crypto";
import { getSecrets } from "./config";
import { getClientAddress } from "./http";

type Bucket = { count: number; resetAt: number };

const globalForRateLimit = globalThis as unknown as {
  __shafileRateLimit?: Map<string, Bucket>;
};

function buckets(): Map<string, Bucket> {
  if (!globalForRateLimit.__shafileRateLimit) {
    globalForRateLimit.__shafileRateLimit = new Map();
  }
  return globalForRateLimit.__shafileRateLimit;
}

export function hashAddress(request: Request): string {
  return createHmac("sha256", getSecrets().ipHashSecret)
    .update(getClientAddress(request))
    .digest("base64url")
    .slice(0, 24);
}

export function rateLimitKey(
  scope: string,
  request: Request,
  suffix?: string,
): string {
  return `${scope}:${hashAddress(request)}${suffix ? `:${suffix}` : ""}`;
}

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const store = buckets();
  if (store.size > 20_000) {
    for (const [entryKey, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(entryKey);
    }
  }

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
