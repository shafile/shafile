import { createHmac } from "node:crypto";
import { getDb } from "./db";
import { getSecrets } from "./config";
import { getClientAddress } from "./http";

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

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const resetAt = now + windowMs;
  const db = await getDb();
  const row = await db.get<{ count: number; reset_at: number }>(
    `INSERT INTO rate_limits (key, count, reset_at)
     VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
     RETURNING count, reset_at`,
    [key, resetAt, now, now],
  );

  if (!row || row.count <= limit) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((row.reset_at - now) / 1000)),
  };
}