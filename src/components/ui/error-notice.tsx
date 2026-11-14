"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { errorCodeOf, retryAfterSecondsOf } from "@/lib/client/errors";

export function ErrorNotice({ error }: { error: unknown }) {
  const t = useTranslations("Errors");
  const code = errorCodeOf(error);
  const retryAfter = retryAfterSecondsOf(error);
  return (
    <div className="notice notice-error" role="alert">
      <AlertTriangle size={18} className="shrink-0" />
      <span>
        {t(code)}
        {retryAfter !== null ? ` ${t("retryAfter", { seconds: retryAfter })}` : ""}
      </span>
    </div>
  );
}