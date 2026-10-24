const DEFAULT_SHORT_NAME = "shafile";
const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const SHORT_NAME_PATTERN = /^[a-z0-9_]{3,30}$/;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getTelegramAppConfig(): {
  botUsername: string | null;
  shortName: string;
} {
  const botUsername = clean(process.env.TELEGRAM_BOT_USERNAME);
  const configuredShortName =
    clean(process.env.TELEGRAM_MINI_APP_SHORT_NAME) ?? DEFAULT_SHORT_NAME;
  return {
    botUsername:
      botUsername && BOT_USERNAME_PATTERN.test(botUsername)
        ? botUsername
        : null,
    shortName: SHORT_NAME_PATTERN.test(configuredShortName)
      ? configuredShortName
      : DEFAULT_SHORT_NAME,
  };
}

export function buildTelegramAppLink(shareId?: string): string | null {
  const { botUsername, shortName } = getTelegramAppConfig();
  if (!botUsername) return null;
  const base = `https://t.me/${botUsername}/${shortName}`;
  return shareId
    ? `${base}?startapp=${encodeURIComponent(shareId)}`
    : base;
}
