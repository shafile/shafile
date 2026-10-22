import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import {
  getLocale,
  getMessages,
  getTranslations,
} from "next-intl/server";
import "./globals.css";
import { localeMeta } from "@/i18n/locales";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const themeScript = `(function(){try{var t=localStorage.getItem('shafile.theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})();`;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    title: t("title"),
    description: t("description"),
    applicationName: "Shafile",
    robots: { index: true, follow: true },
    referrer: "no-referrer",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const meta = localeMeta[locale as keyof typeof localeMeta] ?? localeMeta.en;
  const t = await getTranslations("Common");

  return (
    <html lang={meta.htmlLang} dir={meta.dir} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <a href="#main" className="skip-link">
            {t("skipToContent")}
          </a>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
