import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("Common");
  return (
    <footer className="site-footer">
      <div className="container-page flex flex-col items-start justify-between gap-3 py-8 text-sm text-muted sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <ShieldCheck size={17} className="text-green" />
          <span>{t("footerNote")}</span>
        </div>
        <span className="text-xs uppercase tracking-[0.18em]">{t("footerSecurity")}</span>
      </div>
    </footer>
  );
}
