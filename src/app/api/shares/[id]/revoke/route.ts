import { z } from "zod";
import {
  apiJson,
  assertSameOrigin,
  readJsonLimited,
  routeError,
} from "@/lib/server/http";
import { optionalTelegramSession } from "@/lib/server/auth";
import { consumeRateLimit, rateLimitKey } from "@/lib/server/rate-limit";
import { maybePurge, revokeShare } from "@/lib/server/shares";
import { AppError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  manageToken: z.string().min(10).max(128).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const limit = await consumeRateLimit(
      rateLimitKey("revoke", request, id),
      10,
      10 * 60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    const session = optionalTelegramSession(request);
    const parsed = schema.safeParse(await readJsonLimited(request, 4096));
    if (!parsed.success) throw new AppError("INVALID_REQUEST", 400);

    await revokeShare(id, parsed.data.manageToken ?? null, session?.uid ?? null);
    try {
      await maybePurge(id);
    } catch (error) {
      console.error("[shafile] revoke cleanup failed", error);
    }
    return apiJson({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
