import { z } from "zod";
import { bytesToBase64Url } from "@/lib/shared/encoding";
import {
  AppError,
  apiJson,
  assertSameOrigin,
  readJsonLimited,
  routeError,
} from "@/lib/server/http";
import { consumeRateLimit, rateLimitKey } from "@/lib/server/rate-limit";
import {
  getTelegramBotToken,
  hashTelegramUser,
  validateTelegramInitData,
} from "@/lib/server/telegram";
import {
  createTelegramSessionToken,
  TELEGRAM_SESSION_TTL_MS,
} from "@/lib/server/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  initData: z.string().min(1).max(8192),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = await consumeRateLimit(
      rateLimitKey("telegram-session", request),
      30,
      5 * 60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    const botToken = getTelegramBotToken();
    if (!botToken) throw new AppError("TELEGRAM_NOT_CONFIGURED", 503);

    const parsed = schema.safeParse(await readJsonLimited(request, 16 * 1024));
    if (!parsed.success) throw new AppError("INVALID_REQUEST", 400);

    const launch = validateTelegramInitData(parsed.data.initData, botToken);
    if (!launch) throw new AppError("TELEGRAM_AUTH_FAILED", 401);

    const userHash = bytesToBase64Url(hashTelegramUser(launch.userId));
    const userLimit = await consumeRateLimit(
      `telegram-session:user:${userHash}`,
      30,
      5 * 60 * 1000,
    );
    if (!userLimit.allowed) throw new AppError("RATE_LIMITED", 429);

    return apiJson({
      token: createTelegramSessionToken(userHash),
      expiresIn: Math.floor(TELEGRAM_SESSION_TTL_MS / 1000),
    });
  } catch (error) {
    return routeError(error);
  }
}
