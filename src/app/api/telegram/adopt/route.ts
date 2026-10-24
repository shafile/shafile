import { z } from "zod";
import {
  AppError,
  apiJson,
  assertSameOrigin,
  readJsonLimited,
  routeError,
} from "@/lib/server/http";
import { requireTelegramSession } from "@/lib/server/auth";
import { consumeRateLimit, rateLimitKey } from "@/lib/server/rate-limit";
import { adoptShare } from "@/lib/server/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().max(64),
        manageToken: z.string().min(10).max(128),
      }),
    )
    .min(1)
    .max(100),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = await consumeRateLimit(
      rateLimitKey("telegram-adopt", request),
      20,
      10 * 60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    const session = requireTelegramSession(request);
    const parsed = schema.safeParse(await readJsonLimited(request, 64 * 1024));
    if (!parsed.success) throw new AppError("INVALID_REQUEST", 400);

    let linked = 0;
    let skipped = 0;
    for (const item of parsed.data.items) {
      const result = await adoptShare(item.id, item.manageToken, session.uid);
      if (result === "linked") linked += 1;
      else skipped += 1;
    }

    return apiJson({ linked, skipped });
  } catch (error) {
    return routeError(error);
  }
}
