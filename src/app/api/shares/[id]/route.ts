import { AppError, apiJson, routeError } from "@/lib/server/http";
import { rateLimitKey, consumeRateLimit } from "@/lib/server/rate-limit";
import { requireShare, toShareMeta } from "@/lib/server/shares";

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
    return apiJson(toShareMeta(row));
  } catch (error) {
    return routeError(error);
  }
}
