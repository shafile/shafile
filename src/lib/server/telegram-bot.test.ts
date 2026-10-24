import { describe, expect, it } from "vitest";
import type { ShareMeta } from "@/lib/shared/types";
import {
  botLocale,
  formatShareInfo,
  parseCommand,
  parseShareId,
  startText,
  usageText,
} from "./telegram-bot";

const meta: ShareMeta = {
  id: "AAAAAAAAAAAAAAAAAAAAAA",
  kind: "text",
  status: "ready",
  createdAt: 1_700_000_000_000,
  startAt: null,
  expiresAt: 1_800_000_000_000,
  maxViews: 3,
  views: 1,
  remainingViews: 2,
  hasPassword: true,
  password: null,
  chunkSize: null,
  chunkCount: null,
  serverNow: 1_700_000_000_000,
};

describe("telegram bot parsing", () => {
  it("extracts share ids from links and bare ids", () => {
    expect(
      parseShareId(
        "https://shafile.test/s/AAAAAAAAAAAAAAAAAAAAAA#k=secret",
      ),
    ).toEqual({ id: "AAAAAAAAAAAAAAAAAAAAAA", hadKey: true });
    expect(
      parseShareId(
        "https://t.me/shafiledev_bot/shafile?startapp=AAAAAAAAAAAAAAAAAAAAAA",
      ),
    ).toEqual({ id: "AAAAAAAAAAAAAAAAAAAAAA", hadKey: false });
    expect(parseShareId("id: AAAAAAAAAAAAAAAAAAAAAA.")).toEqual({
      id: "AAAAAAAAAAAAAAAAAAAAAA",
      hadKey: false,
    });
    expect(parseShareId("no share here")).toEqual({
      id: null,
      hadKey: false,
    });
  });

  it("parses commands and strips bot suffixes", () => {
    expect(parseCommand("/start")).toEqual({ name: "start", args: "" });
    expect(parseCommand("/info@shafile_bot AAAAAAAAAAAAAAAAAAAAAA")).toEqual({
      name: "info",
      args: "AAAAAAAAAAAAAAAAAAAAAA",
    });
    expect(parseCommand("https://example.test/s/AAAAAAAAAAAAAAAAAAAAAA")).toBeNull();
  });

  it("maps language codes to bot locales", () => {
    expect(botLocale("zh-CN")).toBe("zh");
    expect(botLocale("zh-hant")).toBe("zh");
    expect(botLocale("en-US")).toBe("en");
    expect(botLocale(undefined)).toBe("en");
  });
});

describe("telegram bot replies", () => {
  it("formats metadata without exposing the password envelope", () => {
    const en = formatShareInfo(meta, "en", true);
    expect(en).toContain("Status: Ready");
    expect(en).toContain("Views: 1/3 (2 left)");
    expect(en).toContain("Password: yes");
    expect(en).toContain("The bot cannot read the content.");
    expect(en).toContain("not the #k link key");
    expect(en).not.toContain("wrappedKey");

    const zh = formatShareInfo(meta, "zh", false);
    expect(zh).toContain("状态: 可用");
    expect(zh).toContain("查看次数: 1/3（剩余 2）");
    expect(zh).toContain("密码: 有");
    expect(zh).not.toContain("#k 密钥");
  });

  it("provides start and usage text", () => {
    expect(startText("en")).toContain("end-to-end encrypted");
    expect(startText("zh")).toContain("端到端加密");
    expect(usageText("en")).toContain("/info");
  });
});
