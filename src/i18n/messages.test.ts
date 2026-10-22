import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import zhCN from "../../messages/zh-CN.json";
import ja from "../../messages/ja.json";
import ko from "../../messages/ko.json";
import ru from "../../messages/ru.json";
import ar from "../../messages/ar.json";
import fr from "../../messages/fr.json";
import de from "../../messages/de.json";
import hi from "../../messages/hi.json";
import esMX from "../../messages/es-MX.json";
import { locales, type Locale } from "./locales";

const dictionaries = {
  en,
  "zh-CN": zhCN,
  ja,
  ko,
  ru,
  ar,
  fr,
  de,
  hi,
  "es-MX": esMX,
} satisfies Record<Locale, unknown>;

describe("message catalogs", () => {
  it("covers every configured locale", () => {
    expect(Object.keys(dictionaries).sort()).toEqual([...locales].sort());
  });

  it.each(locales)("parses plural and parameterized messages in %s", (locale) => {
    const messages = dictionaries[locale] as typeof en;
    const share = createTranslator({
      locale,
      messages,
      namespace: "Share",
    });
    const create = createTranslator({
      locale,
      messages,
      namespace: "Create",
    });

    for (const count of [0, 1, 2, 5]) {
      const text = share("remainingViews", { count });
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain("remainingViews");
    }

    expect(create("fileSelected", { name: "test.txt", size: "1 MB" })).toContain(
      "test.txt",
    );
    expect(
      create("progress", { done: 2, total: 5 }),
    ).toContain("2");
    expect(
      create("inviteWithPassword", {
        link: "https://example.test/s/id#k=key",
        password: "secret",
      }),
    ).toContain("https://example.test/s/id#k=key");
  });
});
