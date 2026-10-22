import { AppError, apiJson, routeError } from "@/lib/server/http";
import { runCleanup } from "@/lib/server/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const authorization = request.headers.get("authorization");
    if (!secret || authorization !== `Bearer ${secret}`) {
      throw new AppError("UNAUTHORIZED", 401);
    }
    await runCleanup();
    return apiJson({ ok: true, serverNow: Date.now() });
  } catch (error) {
    return routeError(error);
  }
}
