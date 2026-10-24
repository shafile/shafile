import { apiJson } from "@/lib/server/http";
import {
  buildTelegramAppLink,
  getTelegramAppConfig,
} from "@/lib/server/telegram-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { botUsername, shortName } = getTelegramAppConfig();
  return apiJson(
    {
      url: buildTelegramAppLink(),
      botUsername,
      shortName,
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
}
