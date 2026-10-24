import {
  AppError,
  apiJson,
  assertSameOrigin,
  routeError,
} from "@/lib/server/http";
import { requireTelegramSession } from "@/lib/server/auth";
import { consumeRateLimit, rateLimitKey } from "@/lib/server/rate-limit";
import { listOwnedShares } from "@/lib/server/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = await consumeRateLimit(
      rateLimitKey("telegram-shares", request),
      60,
      60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    const session = requireTelegramSession(request);
    const items = await listOwnedShares(session.uid);
    return apiJson({ items, serverNow: Date.now() });
  } catch (error) {
    return routeError(error);
  }
}
