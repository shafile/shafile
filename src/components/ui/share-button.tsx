"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { canShareLink, shareLink } from "@/lib/client/telegram";

export function ShareButton({
  url,
  title,
  className = "btn btn-secondary btn-sm",
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const t = useTranslations("Common");
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(canShareLink());
  }, []);

  if (!available) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void shareLink(url, title).catch(() => undefined);
      }}
    >
      <Share2 size={15} />
      {t("share")}
    </button>
  );
}
