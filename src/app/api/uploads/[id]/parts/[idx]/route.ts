import { CHUNK_SIZE } from "@/lib/shared/limits";
import {
  AppError,
  apiJson,
  assertSameOrigin,
  readBodyLimited,
  requireBearerToken,
  routeError,
} from "@/lib/server/http";
import { consumeRateLimit, rateLimitKey } from "@/lib/server/rate-limit";
import { requireUploadSession, savePart } from "@/lib/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; idx: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id, idx } = await context.params;
    const index = Number(idx);
    if (!Number.isInteger(index) || index < 0) {
      throw new AppError("INVALID_REQUEST", 400);
    }

    const token = requireBearerToken(request);
    const row = requireUploadSession(id, token);
    const limit = consumeRateLimit(
      rateLimitKey("upload", request, id),
      2000,
      10 * 60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    const body = await readBodyLimited(request, CHUNK_SIZE + 16 + 4);
    await savePart(row, index, body);
    return apiJson({ ok: true, index });
  } catch (error) {
    return routeError(error);
  }
}
