"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SHARE_ID_PATTERN } from "@/lib/shared/limits";
import {
  buildMiniAppShareUrl,
  canShareLink,
  getTelegramAppShareUrl,
  isTelegramLaunch,
  shareLink,
} from "@/lib/client/telegram";

export function ShareButton({
  url,
  title,
  startParam,
  className = "btn btn-secondary btn-sm",
}: {
  url: string;
  title: string;
  startParam?: string;
  className?: string;
}) {
  const t = useTranslations("Common");
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(canShareLink());
  }, []);

  async function handleShare(): Promise<void> {
    let target = url;
    if (startParam && SHARE_ID_PATTERN.test(startParam) && isTelegramLaunch()) {
      const base = await getTelegramAppShareUrl();
      if (base) target = buildMiniAppShareUrl(base, startParam);
    }
    await shareLink(target, title);
  }

  if (!available) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void handleShare().catch(() => undefined);
      }}
    >
      <Share2 size={15} />
      {t("share")}
    </button>
  );
}
