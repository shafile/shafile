"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { ShareStatusView } from "@/lib/shared/types";

const styles: Record<ShareStatusView, string> = {
  ready: "badge-green",
  draft: "badge-blue",
  scheduled: "badge-yellow",
  expired: "badge-muted",
  revoked: "badge-red",
  exhausted: "badge-muted",
  burned: "badge-red",
};

export function StatusBadge({
  status,
  className,
}: {
  status: ShareStatusView;
  className?: string;
}) {
  const t = useTranslations("Status");
  return <span className={cn("badge", styles[status], className)}>{t(status)}</span>;
}
