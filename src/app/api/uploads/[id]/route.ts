import { apiJson, requireBearerToken, routeError } from "@/lib/server/http";
import { requireUploadSession, uploadStatus } from "@/lib/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const token = requireBearerToken(request);
    const row = requireUploadSession(id, token, true);
    return apiJson(uploadStatus(row));
  } catch (error) {
    return routeError(error);
  }
}
