import { describe, expect, it } from "vitest";
import {
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
} from "./locales";

describe("locale resolution", () => {
  it("normalizes language tags", () => {
    expect(normalizeLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeLocale("zh")).toBe("zh-CN");
    expect(normalizeLocale("ja-JP")).toBe("ja");
    expect(normalizeLocale("ko-KR")).toBe("ko");
    expect(normalizeLocale("ru-RU")).toBe("ru");
    expect(normalizeLocale("ar-EG")).toBe("ar");
    expect(normalizeLocale("fr-CA")).toBe("fr");
    expect(normalizeLocale("de-AT")).toBe("de");
    expect(normalizeLocale("hi-IN")).toBe("hi");
    expect(normalizeLocale("es-MX")).toBe("es-MX");
    expect(normalizeLocale("es-ES")).toBe("es-MX");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("it-IT")).toBeNull();
  });

  it("respects quality values", () => {
    expect(parseAcceptLanguage("it-IT,ja;q=0.9,en;q=0.8")).toBe("ja");
    expect(parseAcceptLanguage("en;q=0.2,zh;q=0.9")).toBe("zh-CN");
    expect(parseAcceptLanguage("pt-BR,ar;q=0.7")).toBe("ar");
    expect(parseAcceptLanguage("*")).toBeNull();
  });

  it("prefers a valid cookie and falls back to english", () => {
    expect(resolveLocale("ja", "en-US,en;q=0.9")).toBe("ja");
    expect(resolveLocale("ar", "en-US,en;q=0.9")).toBe("ar");
    expect(resolveLocale("invalid", "zh-CN,zh;q=0.9")).toBe("zh-CN");
    expect(resolveLocale(null, "de-DE")).toBe("de");
    expect(resolveLocale(null, "es-MX")).toBe("es-MX");
    expect(resolveLocale(null, "it-IT")).toBe("en");
    expect(resolveLocale(null, null)).toBe("en");
  });
});
