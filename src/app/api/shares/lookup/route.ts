import { z } from "zod";
import {
  AppError,
  apiJson,
  assertSameOrigin,
  readJsonLimited,
  routeError,
} from "@/lib/server/http";
import { consumeRateLimit, rateLimitKey } from "@/lib/server/rate-limit";
import { lookupManaged } from "@/lib/server/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().max(64),
        manageToken: z.string().min(10).max(128),
      }),
    )
    .max(100),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = await consumeRateLimit(
      rateLimitKey("lookup", request),
      30,
      60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    const parsed = schema.safeParse(await readJsonLimited(request, 32 * 1024));
    if (!parsed.success) throw new AppError("INVALID_REQUEST", 400);

    const items = (
      await Promise.all(
        parsed.data.items.map((item) =>
          lookupManaged(item.id, item.manageToken),
        ),
      )
    ).filter((item): item is NonNullable<typeof item> => item !== null);

    return apiJson({ items, serverNow: Date.now() });
  } catch (error) {
    return routeError(error);
  }
}
