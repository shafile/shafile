import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Check,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ShareAppButton } from "@/components/ui/share-app-button";

export default async function HomePage() {
  const t = await getTranslations("Home");
  const common = await getTranslations("Common");
  const share = await getTranslations("Share");

  const features = [
    {
      icon: LockKeyhole,
      title: t("featureE2eeTitle"),
      description: t("featureE2eeDesc"),
    },
    {
      icon: Timer,
      title: t("featureBurnTitle"),
      description: t("featureBurnDesc"),
    },
    {
      icon: KeyRound,
      title: t("featurePasswordTitle"),
      description: t("featurePasswordDesc"),
    },
    {
      icon: CalendarClock,
      title: t("featureScheduleTitle"),
      description: t("featureScheduleDesc"),
    },
  ];

  const steps = [
    { title: t("how1Title"), description: t("how1Desc") },
    { title: t("how2Title"), description: t("how2Desc") },
    { title: t("how3Title"), description: t("how3Desc") },
  ];

  return (
    <>
      <div className="tg-home">
        <section className="container-page py-8 sm:py-12">
          <span className="eyebrow">
            <ShieldCheck size={15} />
            {share("encryptedInBrowser")}
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("ctaTitle")}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            {t("ctaDesc")}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/create"
              className="card flex flex-col p-5 transition hover:border-foreground/30"
            >
              <LockKeyhole size={20} className="text-brand" />
              <h2 className="mt-4 flex items-center gap-2 text-base font-semibold">
                {t("ctaPrimary")}
                <ArrowRight size={16} className="directional-icon text-muted" />
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {t("featureE2eeDesc")}
              </p>
            </Link>
            <Link
              href="/manage"
              className="card flex flex-col p-5 transition hover:border-foreground/30"
            >
              <KeyRound size={20} className="text-brand" />
              <h2 className="mt-4 flex items-center gap-2 text-base font-semibold">
                {common("navManage")}
                <ArrowRight size={16} className="directional-icon text-muted" />
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {common("footerNote")}
              </p>
            </Link>
          </div>
          <div className="mt-4">
            <ShareAppButton />
          </div>
          <p className="notice notice-info mt-4">
            <ShieldCheck size={17} className="shrink-0" />
            <span>{t("heroNote")}</span>
          </p>
        </section>
      </div>

      <div className="web-home">
        <section className="container-page grid items-center gap-12 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-28 lg:pt-24">
          <div>
            <span className="eyebrow">{t("eyebrow")}</span>
            <h1 className="display-title mt-5 max-w-[11ch] text-balance">
              {t("title")}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
              {t("description")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/create" className="btn btn-accent btn-lg">
                {t("ctaPrimary")}
                <ArrowRight size={18} className="directional-icon" />
              </Link>
              <a href="#how" className="btn btn-secondary btn-lg">
                {t("ctaSecondary")}
              </a>
            </div>
            <p className="mt-6 flex items-center gap-2 text-sm text-muted">
              <EyeOff size={16} className="text-brand" />
              {t("heroNote")}
            </p>
          </div>

          <div className="hero-visual fade-rise">
            <div className="flex items-center justify-between gap-3">
              <span className="chip">
                <LockKeyhole size={13} className="text-brand" />
                AES-256-GCM
              </span>
              <span className="text-xs text-muted">{t("heroBadge")}</span>
            </div>

            <div className="mt-6 rounded-2xl border border-line bg-surface-2 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-brand">
                  <LockKeyhole size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {share("textTitle")}
                    </span>
                    <span className="badge badge-green">
                      {share("oneTime")}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-2 w-4/5 rounded-full bg-line" />
                    <div className="h-2 w-full rounded-full bg-line" />
                    <div className="h-2 w-2/3 rounded-full bg-line" />
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="badge badge-muted">
                  {share("passwordProtected")}
                </span>
                <span className="badge badge-muted">
                  {share("encryptedInBrowser")}
                </span>
              </div>
            </div>

            <p className="mt-4 flex items-center gap-2 text-xs text-muted">
              <ShieldCheck size={14} className="text-green" />
              {common("footerSecurity")}
            </p>
          </div>
        </section>

        <section
          className="container-page border-t border-line py-14 lg:py-16"
          aria-labelledby="features-title"
        >
          <h2 id="features-title" className="sr-only">
            {t("featureE2eeTitle")}
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div key={feature.title}>
                <feature.icon size={21} className="text-brand" />
                <h3 className="mt-4 text-base font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="container-page scroll-mt-24 py-14 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="section-title text-balance">{t("howTitle")}</h2>
            <p className="mt-4 text-base leading-7 text-muted">
              {t("howDesc")}
            </p>
          </div>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="border-t border-line pt-5">
                <span className="text-xs font-semibold text-brand">
                  0{index + 1}
                </span>
                <h3 className="mt-3 text-base font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="container-page border-t border-line py-14 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <span className="eyebrow">{t("trustTitle")}</span>
              <h2 className="section-title mt-4 text-balance">
                {t("heroBadge")}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted">
                {t("description")}
              </p>
            </div>
            <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[t("trust1"), t("trust2"), t("trust3"), t("trust4")].map(
                (item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 border-t border-line pt-4"
                  >
                    <Check
                      size={16}
                      strokeWidth={2.5}
                      className="mt-0.5 shrink-0 text-green"
                    />
                    <span className="text-sm leading-6">{item}</span>
                  </li>
                ),
              )}
            </ul>
          </div>
        </section>

        <section className="container-page pb-8 pt-8">
          <div className="rounded-2xl border border-line bg-surface px-6 py-10 sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-10">
            <div className="max-w-xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {t("ctaTitle")}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted sm:text-base">
                {t("ctaDesc")}
              </p>
            </div>
            <Link
              href="/create"
              className="btn btn-accent btn-lg mt-6 lg:mt-0"
            >
              {t("ctaButton")}
              <ArrowRight size={18} className="directional-icon" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
