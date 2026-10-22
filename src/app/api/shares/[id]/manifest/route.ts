import { requireAccessToken } from "@/lib/server/auth";
import { AppError, routeError } from "@/lib/server/http";
import { consumeRateLimit, rateLimitKey } from "@/lib/server/rate-limit";
import { assertAccessible, requireShare } from "@/lib/server/shares";
import { fileExists, readManifest } from "@/lib/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const limit = await consumeRateLimit(
      rateLimitKey("manifest", request, id),
      60,
      60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    requireAccessToken(request, id);
    const row = await requireShare(id);
    if (row.kind !== "file") throw new AppError("INVALID_REQUEST", 400);
    assertAccessible(row);

    if (!(await fileExists(id, "manifest"))) {
      throw new AppError("FILE_MISSING", 410);
    }
    const manifest = await readManifest(id);

    return new Response(
      manifest.buffer.slice(
        manifest.byteOffset,
        manifest.byteOffset + manifest.byteLength,
      ) as ArrayBuffer,
      {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    return routeError(error);
  }
}
