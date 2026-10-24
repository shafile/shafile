"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  getTelegramAppShareUrl,
  isTelegramLaunch,
  shareLink,
} from "@/lib/client/telegram";

export function ShareAppButton() {
  const t = useTranslations("Home");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isTelegramLaunch()) return;
    let cancelled = false;
    void getTelegramAppShareUrl().then((value) => {
      if (!cancelled) setUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!url) return null;

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        void shareLink(url, t("shareApp")).catch(() => undefined);
      }}
    >
      <Share2 size={16} />
      {t("shareApp")}
    </button>
  );
}
