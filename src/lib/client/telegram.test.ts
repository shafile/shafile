import { describe, expect, it } from "vitest";
import {
  buildMiniAppShareUrl,
  buildTelegramTheme,
  isWebUrl,
  telegramShareUrl,
} from "./telegram";

describe("telegram theme", () => {
  it("maps theme params onto design tokens", () => {
    const theme = buildTelegramTheme(
      {
        bg_color: "#ffffff",
        secondary_bg_color: "#f4f4f5",
        section_bg_color: "#ffffff",
        text_color: "#000000",
        hint_color: "#707579",
        link_color: "#2481cc",
        button_color: "#3390ec",
        button_text_color: "#ffffff",
      },
      "light",
    );

    expect(theme?.scheme).toBe("light");
    expect(theme?.vars["--background"]).toBe("#ffffff");
    expect(theme?.vars["--surface"]).toBe("#ffffff");
    expect(theme?.vars["--surface-2"]).toBe("#f4f4f5");
    expect(theme?.vars["--foreground"]).toBe("#000000");
    expect(theme?.vars["--muted"]).toBe("#707579");
    expect(theme?.vars["--brand"]).toBe("#2481cc");
    expect(theme?.vars["--brand-solid"]).toBe("#3390ec");
    expect(theme?.vars["--brand-solid-ink"]).toBe("#ffffff");
    expect(theme?.vars["--line"]).toContain("color-mix");
  });

  it("uses dark scheme and falls back when optional colors are missing", () => {
    const theme = buildTelegramTheme(
      { bg_color: "#17212b", text_color: "#ffffff" },
      "dark",
    );

    expect(theme?.scheme).toBe("dark");
    expect(theme?.vars["--background"]).toBe("#17212b");
    expect(theme?.vars["--surface"]).toBe("#17212b");
    expect(theme?.vars["--brand"]).toBe("#ffffff");
  });

  it("requires a background and text color", () => {
    expect(buildTelegramTheme({ bg_color: "#ffffff" }, "light")).toBeNull();
    expect(buildTelegramTheme(undefined, "light")).toBeNull();
  });

  it("ignores values that are not plain CSS colors", () => {
    const theme = buildTelegramTheme(
      { bg_color: "#ffffff", text_color: "url(javascript:alert(1))" },
      "light",
    );
    expect(theme).toBeNull();
  });
});

describe("telegram share url", () => {
  it("keeps the fragment key encoded", () => {
    expect(telegramShareUrl("https://shafile.test/s/abc#k=secret")).toBe(
      "https://t.me/share/url?url=https%3A%2F%2Fshafile.test%2Fs%2Fabc%23k%3Dsecret",
    );
  });

  it("adds a startapp parameter to a mini app link", () => {
    expect(
      buildMiniAppShareUrl(
        "https://t.me/shafiledev_bot/shafile",
        "AAAAAAAAAAAAAAAAAAAAAA",
      ),
    ).toBe(
      "https://t.me/shafiledev_bot/shafile?startapp=AAAAAAAAAAAAAAAAAAAAAA",
    );
  });
});

describe("telegram external links", () => {
  it("accepts only http and https urls", () => {
    expect(isWebUrl("https://example.com/path?q=1")).toBe(true);
    expect(isWebUrl("http://example.com")).toBe(true);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl("tg://resolve?domain=shafile")).toBe(false);
    expect(isWebUrl("not a url")).toBe(false);
  });
});
