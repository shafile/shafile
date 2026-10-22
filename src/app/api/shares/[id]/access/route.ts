import { z } from "zod";
import { verifyPasswordVerifier } from "@/lib/server/auth";
import {
  AppError,
  apiJson,
  assertSameOrigin,
  readJsonLimited,
  routeError,
} from "@/lib/server/http";
import { consumeRateLimit, rateLimitKey } from "@/lib/server/rate-limit";
import {
  assertAccessible,
  getPasswordMeta,
  requireShare,
} from "@/lib/server/shares";
import { createAccessToken } from "@/lib/server/tokens";
import { base64UrlToBytes } from "@/lib/shared/encoding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  authKey: z.string().min(1).max(64).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const limit = await consumeRateLimit(
      rateLimitKey("access", request, id),
      20,
      5 * 60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    const row = await requireShare(id);
    assertAccessible(row);

    const password = getPasswordMeta(row);
    if (password) {
      const parsed = schema.safeParse(
        await readJsonLimited(request, 4096).catch(() => ({})),
      );
      if (!parsed.success || !parsed.data.authKey) {
        throw new AppError("INVALID_PASSWORD", 401);
      }
      let authKey: Uint8Array;
      try {
        authKey = base64UrlToBytes(parsed.data.authKey);
      } catch {
        throw new AppError("INVALID_PASSWORD", 401);
      }
      if (!verifyPasswordVerifier(authKey, row.password_verifier)) {
        throw new AppError("INVALID_PASSWORD", 401);
      }
    }

    return apiJson({
      token: createAccessToken(id),
      expiresIn: 600,
      serverNow: Date.now(),
    });
  } catch (error) {
    return routeError(error);
  }
}
