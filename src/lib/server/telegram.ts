import { createHmac } from "node:crypto";
import { getSecrets } from "./config";

export const TELEGRAM_AUTH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const TELEGRAM_AUTH_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type TelegramLaunch = {
  userId: number;
  authDate: number;
  languageCode: string | null;
};

function hexBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const output = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index]! ^ b[index]!;
  }
  return diff === 0;
}

export function getTelegramBotToken(): string | null {
  const value = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return value ? value : null;
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  now = Date.now(),
): TelegramLaunch | null {
  if (!initData || initData.length > 8192) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get("hash");
  if (!hash) return null;
  const actual = hexBytes(hash);
  if (!actual) return null;

  const entries: [string, string][] = [];
  for (const [key, value] of params) {
    if (key === "hash" || key === "signature") continue;
    entries.push([key, value]);
  }
  entries.sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const dataCheckString = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = new Uint8Array(
    createHmac("sha256", secret).update(dataCheckString).digest(),
  );
  if (!equalBytes(actual, expected)) return null;

  const authDateRaw = params.get("auth_date");
  const authDateSeconds = authDateRaw ? Number.parseInt(authDateRaw, 10) : NaN;
  if (!Number.isFinite(authDateSeconds) || authDateSeconds <= 0) return null;
  const authDate = authDateSeconds * 1000;
  if (authDate > now + TELEGRAM_AUTH_FUTURE_SKEW_MS) return null;
  if (now - authDate > TELEGRAM_AUTH_MAX_AGE_MS) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  let user: { id?: unknown; language_code?: unknown };
  try {
    user = JSON.parse(userRaw) as { id?: unknown; language_code?: unknown };
  } catch {
    return null;
  }

  const userId =
    typeof user.id === "number" ? user.id : Number.parseInt(String(user.id), 10);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;

  return {
    userId,
    authDate,
    languageCode:
      typeof user.language_code === "string" ? user.language_code : null,
  };
}

export function hashTelegramUser(userId: number): Uint8Array {
  return new Uint8Array(
    createHmac("sha256", getSecrets().telegramHashSecret)
      .update(`telegram:${userId}`)
      .digest(),
  );
}
