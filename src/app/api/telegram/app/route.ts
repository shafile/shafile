import { apiJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SHORT_NAME = "shafile";
const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const SHORT_NAME_PATTERN = /^[a-z0-9_]{3,30}$/;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function GET() {
  const botUsername = clean(process.env.TELEGRAM_BOT_USERNAME);
  const configuredShortName =
    clean(process.env.TELEGRAM_MINI_APP_SHORT_NAME) ?? DEFAULT_SHORT_NAME;
  const shortName = SHORT_NAME_PATTERN.test(configuredShortName)
    ? configuredShortName
    : DEFAULT_SHORT_NAME;

  if (!botUsername || !BOT_USERNAME_PATTERN.test(botUsername)) {
    return apiJson({ url: null, botUsername: null, shortName });
  }

  return apiJson(
    {
      url: `https://t.me/${botUsername}/${shortName}`,
      botUsername,
      shortName,
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
}
