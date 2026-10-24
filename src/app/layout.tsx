import type { Metadata, Viewport } from "next";
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
import { TelegramBridge } from "@/components/telegram-bridge";

const themeScript = `(function(){try{var r=document.documentElement;var t=localStorage.getItem('shafile.theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}r.dataset.theme=t;if(/(?:^|&)tgWebApp(?:Data|Version|Platform|ThemeParams|InitData|StartParam)=/.test(location.hash.slice(1))){r.dataset.tg='1'}}catch(e){}})();`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#14100d" },
  ],
};

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
      <body className="flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TelegramBridge />
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
