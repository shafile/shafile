import Link from "next/link";
import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  const common = await getTranslations("Common");
  return (
    <div className="container-page max-w-2xl py-16">
      <div className="card p-6 text-center sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <Compass size={26} />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{t("description")}</p>
        <Link href="/" className="btn btn-secondary mt-6">
          {common("backHome")}
        </Link>
      </div>
    </div>
  );
}
