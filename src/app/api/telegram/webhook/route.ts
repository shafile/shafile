import { getShareRow } from "@/lib/server/db";
import { readJsonLimited } from "@/lib/server/http";
import { toShareMeta } from "@/lib/server/shares";
import { buildTelegramAppLink } from "@/lib/server/telegram-app";
import { getTelegramBotToken } from "@/lib/server/telegram";
import {
  botLocale,
  formatShareInfo,
  linkShareIdPromptText,
  linkSharePromptText,
  miniAppButtonLabel,
  notFoundText,
  openMiniAppButtonLabel,
  parseCommand,
  parseShareId,
  sharePromptText,
  startText,
  usageText,
  type BotLocale,
} from "@/lib/server/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number | string };
    from?: { is_bot?: boolean; language_code?: string };
  };
};

type InlineButton = {
  text: string;
  url?: string;
  web_app?: { url: string };
};

async function sendMessage(
  chatId: number | string,
  text: string,
  button?: InlineButton,
): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) return;

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
  };
  if (button) {
    payload.reply_markup = { inline_keyboard: [[button]] };
  }

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function startButton(
  locale: BotLocale,
  origin: string,
): InlineButton | undefined {
  if (!origin.startsWith("https://")) return undefined;
  return {
    text: miniAppButtonLabel(locale),
    web_app: { url: `${origin}/` },
  };
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Telegram webhook is not configured", { status: 503 });
  }
  if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!getTelegramBotToken()) {
    return new Response("Telegram bot is not configured", { status: 503 });
  }

  let update: TelegramUpdate;
  try {
    update = await readJsonLimited<TelegramUpdate>(request, 64 * 1024);
  } catch {
    return new Response("Invalid update", { status: 400 });
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text;
  if (!chatId || !text || message?.from?.is_bot) {
    return new Response("ok", { status: 200 });
  }

  const locale = botLocale(message.from?.language_code);
  const origin = new URL(request.url).origin;
  const command = parseCommand(text);
  const isInfo = command?.name === "info";
  let reply: string;
  let button: InlineButton | undefined;

  if (command?.name === "start") {
    reply = startText(locale);
    button = startButton(locale, origin);
  } else if (command && !isInfo) {
    reply = usageText(locale);
  } else {
    const candidate = isInfo ? command.args : text;
    const { id, hadKey } = parseShareId(candidate);
    if (!id) {
      reply = usageText(locale);
    } else {
      const row = await getShareRow(id);
      if (!row) {
        reply = notFoundText(locale);
      } else {
        const meta = toShareMeta(row);
        if (isInfo) {
          reply = formatShareInfo(meta, locale, hadKey);
        } else if (meta.hasPassword) {
          const deepLink = buildTelegramAppLink(id);
          reply = sharePromptText(meta, locale, Boolean(deepLink));
          if (deepLink) {
            button = {
              text: openMiniAppButtonLabel(locale),
              url: deepLink,
            };
          }
        } else {
          reply = /\/s\//.test(text)
            ? linkSharePromptText(locale)
            : linkShareIdPromptText(locale);
        }
      }
    }
  }

  try {
    await sendMessage(chatId, reply, button);
  } catch {
    return new Response("Telegram API error", { status: 502 });
  }

  return new Response("ok", {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
