"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("ErrorPage");
  const common = useTranslations("Common");
  return (
    <div className="container-page max-w-2xl py-16">
      <div className="card p-6 text-center sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-soft text-red">
          <AlertTriangle size={26} />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{t("description")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={reset}>
            {t("retry")}
          </button>
          <Link href="/" className="btn btn-secondary">
            {common("backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
