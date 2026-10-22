import { requireAccessToken } from "@/lib/server/auth";
import { AppError, routeError } from "@/lib/server/http";
import { consumeRateLimit, rateLimitKey } from "@/lib/server/rate-limit";
import {
  assertAccessible,
  consumeView,
  maybePurge,
  requireShare,
} from "@/lib/server/shares";
import { fileExists, readTextBlob } from "@/lib/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const limit = await consumeRateLimit(
      rateLimitKey("content", request, id),
      30,
      60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    requireAccessToken(request, id);
    const row = await requireShare(id);
    if (row.kind !== "text") throw new AppError("INVALID_REQUEST", 400);
    assertAccessible(row);

    if (!(await fileExists(id, "text"))) {
      throw new AppError("FILE_MISSING", 410);
    }

    const consumed = await consumeView(id);
    const payload = await readTextBlob(id);
    try {
      await maybePurge(id);
    } catch (error) {
      console.error("[shafile] text cleanup failed", error);
    }

    const remaining =
      consumed.maxViews === null
        ? "unlimited"
        : String(Math.max(0, consumed.maxViews - consumed.views));

    return new Response(
      payload.buffer.slice(
        payload.byteOffset,
        payload.byteOffset + payload.byteLength,
      ) as ArrayBuffer,
      {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "X-Remaining-Views": remaining,
        },
      },
    );
  } catch (error) {
    return routeError(error);
  }
}
