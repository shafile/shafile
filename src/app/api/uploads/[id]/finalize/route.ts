import { z } from "zod";
import { MAX_MANIFEST_BYTES } from "@/lib/shared/limits";
import { base64UrlToBytes } from "@/lib/shared/encoding";
import {
  AppError,
  apiJson,
  assertSameOrigin,
  readJsonLimited,
  requireBearerToken,
  routeError,
} from "@/lib/server/http";
import { finalizeUpload, requireUploadSession } from "@/lib/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  manifest: z.string().min(1).max(MAX_MANIFEST_BYTES * 2),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const token = requireBearerToken(request);
    const row = requireUploadSession(id, token, true);
    const parsed = schema.safeParse(
      await readJsonLimited(request, MAX_MANIFEST_BYTES * 2 + 1024),
    );
    if (!parsed.success) throw new AppError("INVALID_REQUEST", 400);

    let manifest: Uint8Array;
    try {
      manifest = base64UrlToBytes(parsed.data.manifest);
    } catch {
      throw new AppError("INVALID_REQUEST", 400);
    }
    await finalizeUpload(row, manifest);
    return apiJson({ ok: true, id });
  } catch (error) {
    return routeError(error);
  }
}
