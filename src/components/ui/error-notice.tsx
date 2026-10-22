"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { errorCodeOf } from "@/lib/client/errors";

export function ErrorNotice({ error }: { error: unknown }) {
  const t = useTranslations("Errors");
  const code = errorCodeOf(error);
  return (
    <div className="notice notice-error" role="alert">
      <AlertTriangle size={18} className="shrink-0" />
      <span>{t(code)}</span>
    </div>
  );
}