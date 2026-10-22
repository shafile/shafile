export const locales = [
  "en",
  "zh-CN",
  "ja",
  "ko",
  "ru",
  "ar",
  "fr",
  "de",
  "hi",
  "es-MX",
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeCookieName = "shafile_locale";

export const localeMeta: Record<
  Locale,
  { label: string; htmlLang: string; dir: "ltr" | "rtl" }
> = {
  en: { label: "English", htmlLang: "en", dir: "ltr" },
  "zh-CN": { label: "简体中文", htmlLang: "zh-CN", dir: "ltr" },
  ja: { label: "日本語", htmlLang: "ja", dir: "ltr" },
  ko: { label: "한국어", htmlLang: "ko", dir: "ltr" },
  ru: { label: "Русский", htmlLang: "ru", dir: "ltr" },
  ar: { label: "العربية", htmlLang: "ar", dir: "rtl" },
  fr: { label: "Français", htmlLang: "fr", dir: "ltr" },
  de: { label: "Deutsch", htmlLang: "de", dir: "ltr" },
  hi: { label: "हिन्दी", htmlLang: "hi", dir: "ltr" },
  "es-MX": { label: "Español (México)", htmlLang: "es-MX", dir: "ltr" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const tag = value.trim().toLowerCase();
  if (!tag || tag === "*") return null;
  if (tag === "en" || tag.startsWith("en-")) return "en";
  if (tag === "ja" || tag.startsWith("ja-")) return "ja";
  if (tag === "zh" || tag.startsWith("zh-")) return "zh-CN";
  if (tag === "ko" || tag.startsWith("ko-")) return "ko";
  if (tag === "ru" || tag.startsWith("ru-")) return "ru";
  if (tag === "ar" || tag.startsWith("ar-")) return "ar";
  if (tag === "fr" || tag.startsWith("fr-")) return "fr";
  if (tag === "de" || tag.startsWith("de-")) return "de";
  if (tag === "hi" || tag.startsWith("hi-")) return "hi";
  if (tag === "es" || tag.startsWith("es-")) return "es-MX";
  return null;
}

export function parseAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;

  const candidates = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      let quality = 1;
      for (const param of params) {
        const [key, rawValue] = param.trim().split("=");
        if (key === "q") {
          const parsed = Number.parseFloat(rawValue ?? "");
          quality = Number.isFinite(parsed) ? parsed : 0;
        }
      }
      return { tag, quality, index };
    })
    .filter((candidate) => candidate.tag && candidate.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate.tag);
    if (locale) return locale;
  }
  return null;
}

export function resolveLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null,
): Locale {
  return isLocale(cookieValue)
    ? cookieValue
    : parseAcceptLanguage(acceptLanguage) ?? defaultLocale;
}

export function isTextLocale(locale: string): locale is Locale {
  return isLocale(locale);
}
