import { AppError, apiJson, routeError } from "@/lib/server/http";
import { rateLimitKey, consumeRateLimit } from "@/lib/server/rate-limit";
import { maybePurge, requireShare, toShareMeta } from "@/lib/server/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const limit = consumeRateLimit(
      rateLimitKey("meta", request, id),
      120,
      60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    const row = requireShare(id);
    const meta = toShareMeta(row);
    if (meta.status === "expired") {
      await maybePurge(id).catch((error) => {
        console.error("[shafile] expiry cleanup failed", error);
      });
    }
    return apiJson(meta);
  } catch (error) {
    return routeError(error);
  }
}
