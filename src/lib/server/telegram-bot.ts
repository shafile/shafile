import type { ShareMeta } from "@/lib/shared/types";
import { SHARE_ID_PATTERN } from "@/lib/shared/limits";

export type BotLocale = "en" | "zh";

type Command = { name: string; args: string };

const STATUS_LABELS: Record<
  ShareMeta["status"],
  { en: string; zh: string }
> = {
  ready: { en: "Ready", zh: "可用" },
  draft: { en: "Uploading", zh: "上传中" },
  scheduled: { en: "Scheduled", zh: "定时" },
  expired: { en: "Expired", zh: "已过期" },
  revoked: { en: "Revoked", zh: "已撤销" },
  exhausted: { en: "Used up", zh: "已用完" },
  burned: { en: "Burned", zh: "已焚毁" },
};

export function botLocale(languageCode: string | undefined): BotLocale {
  return languageCode?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function parseCommand(text: string): Command | null {
  const match =
    /^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;
  return { name: match[1]!.toLowerCase(), args: match[2] ?? "" };
}

export function parseShareId(text: string): {
  id: string | null;
  hadKey: boolean;
} {
  const hadKey = /#k=/.test(text);
  const startParamMatch = /[?&]startapp=([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/.exec(text);
  if (startParamMatch && SHARE_ID_PATTERN.test(startParamMatch[1]!)) {
    return { id: startParamMatch[1]!, hadKey };
  }

  const urlMatch = /\/s\/([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/.exec(text);
  if (urlMatch && SHARE_ID_PATTERN.test(urlMatch[1]!)) {
    return { id: urlMatch[1]!, hadKey };
  }

  const tokenMatch = /(?:^|\s)([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/.exec(text);
  if (tokenMatch && SHARE_ID_PATTERN.test(tokenMatch[1]!)) {
    return { id: tokenMatch[1]!, hadKey };
  }

  return { id: null, hadKey };
}

function formatDate(value: number, locale: BotLocale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatShareInfo(
  meta: ShareMeta,
  locale: BotLocale,
  hadKey: boolean,
): string {
  const zh = locale === "zh";
  const lines = [
    zh ? "Shafile 分享" : "Shafile share",
    `${zh ? "ID" : "ID"}: ${meta.id}`,
    `${zh ? "类型" : "Type"}: ${meta.kind === "file" ? (zh ? "文件" : "file") : zh ? "文本" : "text"}`,
    `${zh ? "状态" : "Status"}: ${STATUS_LABELS[meta.status][locale]}`,
  ];

  if (meta.startAt !== null && meta.status === "scheduled") {
    lines.push(
      `${zh ? "开始" : "Starts"}: ${formatDate(meta.startAt, locale)} UTC`,
    );
  }
  lines.push(
    `${zh ? "到期" : "Expires"}: ${
      meta.expiresAt === null
        ? zh
          ? "永不过期"
          : "No expiry"
        : `${formatDate(meta.expiresAt, locale)} UTC`
    }`,
  );
  lines.push(
    `${zh ? "查看次数" : "Views"}: ${
      meta.maxViews === null
        ? zh
          ? "不限"
          : "unlimited"
        : zh
          ? `${meta.views}/${meta.maxViews}（剩余 ${meta.remainingViews ?? 0}）`
          : `${meta.views}/${meta.maxViews} (${meta.remainingViews ?? 0} left)`
    }`,
  );
  lines.push(
    `${zh ? "密码" : "Password"}: ${meta.hasPassword ? (zh ? "有" : "yes") : zh ? "无" : "no"}`,
  );
  lines.push(
    zh
      ? "请在浏览器中打开完整链接解密；Bot 无法读取内容。"
      : "Open the full link in a browser to decrypt. The bot cannot read the content.",
  );
  if (hadKey) {
    lines.push(
      zh
        ? "安全提示：只发送分享 ID，不要发送链接中的 #k 密钥。"
        : "Security: send only the share ID, not the #k link key.",
    );
  }
  return lines.join("\n");
}

export function usageText(locale: BotLocale): string {
  return locale === "zh"
    ? "用法：发送 /info <分享 ID 或链接> 查询状态。Bot 只能读取元数据，不能解密内容。"
    : "Usage: send /info <share id or link> to check a share. The bot can only read metadata, not content.";
}

export function startText(locale: BotLocale): string {
  return locale === "zh"
    ? "Shafile 使用端到端加密。发送 /info <分享 ID> 查询状态，或打开 Mini App 创建和查看分享。"
    : "Shafile is end-to-end encrypted. Send /info <share id> to check a share, or open the Mini App to create and view shares.";
}

export function miniAppButtonLabel(locale: BotLocale): string {
  return locale === "zh" ? "打开 Shafile" : "Open Shafile";
}

export function notFoundText(locale: BotLocale): string {
  return locale === "zh"
    ? "找不到这个分享，可能已被删除或过期。"
    : "Share not found. It may have been deleted or expired.";
}
