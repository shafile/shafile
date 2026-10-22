import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { localeCookieName, resolveLocale } from "./locales";

const messageLoaders = {
  en: () => import("../../messages/en.json"),
  "zh-CN": () => import("../../messages/zh-CN.json"),
  ja: () => import("../../messages/ja.json"),
  ko: () => import("../../messages/ko.json"),
  ru: () => import("../../messages/ru.json"),
  ar: () => import("../../messages/ar.json"),
  fr: () => import("../../messages/fr.json"),
  de: () => import("../../messages/de.json"),
  hi: () => import("../../messages/hi.json"),
  "es-MX": () => import("../../messages/es-MX.json"),
} as const;

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(localeCookieName)?.value,
    headerStore.get("accept-language"),
  );

  return {
    locale,
    messages: (await messageLoaders[locale]()).default,
    timeZone: "UTC",
  };
});
