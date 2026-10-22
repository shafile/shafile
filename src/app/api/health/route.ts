import { getDb } from "@/lib/server/db";
import { apiJson, routeError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb().prepare("SELECT 1 AS ok").get();
    return apiJson({ ok: true, time: Date.now() });
  } catch (error) {
    return routeError(error);
  }
}
