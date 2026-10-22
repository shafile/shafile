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
import { fileExists, streamShareBlob } from "@/lib/server/storage";
import { keepAlive } from "@/lib/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function streamWithCleanup(
  source: ReadableStream<Uint8Array>,
  id: string,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let finished = false;

  async function finish() {
    if (finished) return;
    finished = true;
    await keepAlive(endActiveStream(id));
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          controller.close();
          await finish();
        } else {
          controller.enqueue(next.value);
        }
      } catch (error) {
        controller.error(error);
        await finish();
      }
    },
    async cancel() {
      await reader.cancel().catch(() => undefined);
      await finish();
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const limit = await consumeRateLimit(
      rateLimitKey("download", request, id),
      10,
      60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    requireAccessToken(request, id);
    const row = await requireShare(id);
    if (row.kind !== "file") throw new AppError("INVALID_REQUEST", 400);
    assertAccessible(row);

    const chunkCount = row.chunk_count ?? 0;
    if (
      !(await fileExists(id, "header")) ||
      !(await fileExists(id, "manifest"))
    ) {
      throw new AppError("FILE_MISSING", 410);
    }
    await beginActiveStream(id);
    try {
      const consumed = await consumeView(id);
      const source = await streamShareBlob(id, chunkCount);
      const remaining =
        consumed.maxViews === null
          ? "unlimited"
          : String(Math.max(0, consumed.maxViews - consumed.views));

      return new Response(streamWithCleanup(source, id), {
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
