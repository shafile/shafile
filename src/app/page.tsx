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
      accent: "bg-brand-soft text-brand",
    },
    {
      icon: Timer,
      title: t("featureBurnTitle"),
      description: t("featureBurnDesc"),
      accent: "bg-green-soft text-green-strong",
    },
    {
      icon: KeyRound,
      title: t("featurePasswordTitle"),
      description: t("featurePasswordDesc"),
      accent: "bg-yellow-soft text-yellow",
    },
    {
      icon: CalendarClock,
      title: t("featureScheduleTitle"),
      description: t("featureScheduleDesc"),
      accent: "bg-blue-soft text-blue",
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
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("ctaTitle")}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            {t("ctaDesc")}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/create"
              className="card flex flex-col p-5 transition hover:border-brand"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <LockKeyhole size={21} />
              </span>
              <h2 className="mt-4 flex items-center gap-2 text-lg font-bold">
                {t("ctaPrimary")}
                <ArrowRight size={17} className="directional-icon text-brand" />
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {t("featureE2eeDesc")}
              </p>
            </Link>
            <Link
              href="/manage"
              className="card flex flex-col p-5 transition hover:border-brand"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-soft text-blue">
                <KeyRound size={21} />
              </span>
              <h2 className="mt-4 flex items-center gap-2 text-lg font-bold">
                {common("navManage")}
                <ArrowRight size={17} className="directional-icon text-brand" />
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
      <section className="container-page grid items-center gap-10 pb-16 pt-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14 lg:pb-24 lg:pt-20">
        <div>
          <span className="eyebrow">
            <ShieldCheck size={15} />
            {t("eyebrow")}
          </span>
          <h1 className="display-title mt-4 max-w-[11ch] text-balance">
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
          <p className="mt-5 flex items-center gap-2 text-sm text-muted">
            <EyeOff size={16} className="text-brand" />
            {t("heroNote")}
          </p>
        </div>

        <div className="hero-visual fade-rise">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold tracking-wide">
              <span className="h-2 w-2 rounded-full bg-accent" />
              AES-256-GCM
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-bold text-white/80">
              <LockKeyhole size={13} />
              {t("heroBadge")}
            </span>
          </div>

          <div className="relative mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <LockKeyhole size={21} />
              </span>
              <div className="min-w-0">
                <div className="h-2.5 w-28 rounded-full bg-white/70" />
                <div className="mt-2 h-2 w-40 max-w-full rounded-full bg-white/25" />
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-accent/20 px-2.5 py-1 text-[11px] font-bold hero-accent-text">
                    {share("oneTime")}
                  </span>
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/80">
                    {share("passwordProtected")}
                  </span>
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/80">
                    {share("encryptedInBrowser")}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <div className="h-1.5 w-8 rounded-full bg-white/30" />
                  <div className="mt-2 h-1.5 w-full rounded-full bg-white/15" />
                  <div className="mt-1.5 h-1.5 w-2/3 rounded-full bg-white/15" />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 text-xs text-white/70">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="hero-accent-text" />
              {common("footerSecurity")}
            </span>
            <span className="font-mono" dir="ltr">
              #k=••••••••
            </span>
          </div>
        </div>
      </section>

      <section className="container-page pb-16" aria-labelledby="features-title">
        <h2 id="features-title" className="sr-only">
          {t("featureE2eeTitle")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div key={feature.title} className="card p-5">
              <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${feature.accent}`}>
                <feature.icon size={21} />
              </span>
              <h3 className="mt-4 text-base font-bold tracking-tight">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="container-page scroll-mt-24 py-12 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="section-title text-balance">{t("howTitle")}</h2>
          <p className="mt-4 text-base leading-7 text-muted">{t("howDesc")}</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="card-soft relative overflow-hidden p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-solid text-sm font-bold text-white">
                {index + 1}
              </span>
              <h3 className="mt-5 text-lg font-bold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{step.description}</p>
              <span className="absolute -bottom-8 -end-6 text-[7rem] font-bold leading-none text-brand/5">
                {index + 1}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page py-12 lg:py-16">
        <div className="grid gap-8 rounded-2xl border border-line bg-surface-2/60 p-6 sm:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <span className="chip">
              <EyeOff size={14} />
              {t("trustTitle")}
            </span>
            <h2 className="section-title mt-4 text-balance">{t("heroBadge")}</h2>
            <p className="mt-4 text-sm leading-7 text-muted">{t("description")}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[t("trust1"), t("trust2"), t("trust3"), t("trust4")].map((item) => (
              <li key={item} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-soft text-green-strong">
                  <Check size={14} strokeWidth={3} />
                </span>
                <span className="text-sm leading-6">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container-page pb-8 pt-8">
        <div className="rounded-2xl border border-line bg-surface px-6 py-10 sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("ctaTitle")}</h2>
            <p className="mt-3 text-sm leading-7 text-muted sm:text-base">{t("ctaDesc")}</p>
          </div>
          <Link href="/create" className="btn btn-primary btn-lg mt-6 lg:mt-0">
            {t("ctaButton")}
            <ArrowRight size={18} className="directional-icon" />
          </Link>
        </div>
      </section>
      </div>
    </>
  );
}
