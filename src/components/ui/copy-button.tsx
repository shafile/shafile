"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export function CopyButton({
  value,
  label,
  displayLabel,
  className,
  compact = false,
}: {
  value: string;
  label: string;
  displayLabel?: string;
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations("Common");
  const a11y = useTranslations("Accessibility");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn("btn btn-secondary btn-sm", className)}
      aria-label={a11y("copyField", { label })}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {!compact && (
        <span>{copied ? t("copied") : displayLabel ?? t("copy")}</span>
      )}
      {compact && <span className="sr-only">{copied ? t("copied") : t("copy")}</span>}
    </button>
  );
}
