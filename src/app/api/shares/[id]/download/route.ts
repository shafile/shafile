import { Readable } from "node:stream";
import { requireAccessToken } from "@/lib/server/auth";
import { AppError, routeError } from "@/lib/server/http";
import { consumeRateLimit, rateLimitKey } from "@/lib/server/rate-limit";
import {
  assertAccessible,
  beginActiveStream,
  consumeView,
  endActiveStream,
  requireShare,
} from "@/lib/server/shares";
import {
  createBlobReadStream,
  fileExists,
  headerBlobPath,
  manifestBlobPath,
  partBlobPath,
} from "@/lib/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function* streamBlob(id: string, chunkCount: number) {
  try {
    const paths = [
      headerBlobPath(id),
      ...Array.from({ length: chunkCount }, (_, index) => partBlobPath(id, index)),
      manifestBlobPath(id),
    ];
    for (const path of paths) {
      const stream = createBlobReadStream(path);
      for await (const chunk of stream) {
        yield chunk as Buffer;
      }
    }
  } finally {
    await endActiveStream(id);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const limit = consumeRateLimit(
      rateLimitKey("download", request, id),
      10,
      60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    requireAccessToken(request, id);
    const row = requireShare(id);
    if (row.kind !== "file") throw new AppError("INVALID_REQUEST", 400);
    assertAccessible(row);

    const chunkCount = row.chunk_count ?? 0;
    const required = [
      headerBlobPath(id),
      manifestBlobPath(id),
      ...Array.from({ length: chunkCount }, (_, index) => partBlobPath(id, index)),
    ];
    for (const path of required) {
      if (!(await fileExists(path))) throw new AppError("FILE_MISSING", 410);
    }

    beginActiveStream(id);

    try {
      const consumed = consumeView(id);
      const body = Readable.toWeb(
        Readable.from(streamBlob(id, chunkCount)),
      ) as ReadableStream;
      const remaining =
        consumed.maxViews === null
          ? "unlimited"
          : String(Math.max(0, consumed.maxViews - consumed.views));

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(row.blob_bytes),
          "Content-Disposition": 'attachment; filename="shafile-encrypted.bin"',
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "X-Remaining-Views": remaining,
        },
      });
    } catch (error) {
      await endActiveStream(id);
      throw error;
    }
  } catch (error) {
    return routeError(error);
  }
}
