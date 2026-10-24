import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateTelegramInitData } from "./telegram";

const BOT_TOKEN = "123456:test-bot-token";

function sign(
  fields: Record<string, string>,
  botToken = BOT_TOKEN,
): string {
  const params = new URLSearchParams(fields);
  const entries = [...params.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const dataCheckString = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");
  params.set("hash", hash);
  return params.toString();
}

function createInitData(
  overrides: Record<string, string> = {},
  botToken = BOT_TOKEN,
): string {
  return sign(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "AAH-test",
      user: JSON.stringify({
        id: 123456789,
        first_name: "Test",
        language_code: "ru",
      }),
      ...overrides,
    },
    botToken,
  );
}

describe("validateTelegramInitData", () => {
  it("accepts a correctly signed launch payload", () => {
    const launch = validateTelegramInitData(createInitData(), BOT_TOKEN);
    expect(launch?.userId).toBe(123456789);
    expect(launch?.languageCode).toBe("ru");
  });

  it("rejects the wrong bot token", () => {
    expect(validateTelegramInitData(createInitData(), "wrong-token")).toBeNull();
  });

  it("rejects tampered fields", () => {
    const initData = createInitData();
    const tampered = initData.replace(
      encodeURIComponent('"id":123456789'),
      encodeURIComponent('"id":987654321'),
    );
    expect(validateTelegramInitData(tampered, BOT_TOKEN)).toBeNull();
  });

  it("rejects stale and future auth dates", () => {
    const now = Date.now();
    const stale = Math.floor((now - 25 * 60 * 60 * 1000) / 1000);
    const future = Math.floor((now + 10 * 60 * 1000) / 1000);
    expect(
      validateTelegramInitData(
        createInitData({ auth_date: String(stale) }),
        BOT_TOKEN,
      ),
    ).toBeNull();
    expect(
      validateTelegramInitData(
        createInitData({ auth_date: String(future) }),
        BOT_TOKEN,
      ),
    ).toBeNull();
  });

  it("requires a valid user id", () => {
    const missing = createInitData({ user: "" });
    expect(validateTelegramInitData(missing, BOT_TOKEN)).toBeNull();

    const invalid = createInitData({
      user: JSON.stringify({ id: "not-a-number" }),
    });
    expect(validateTelegramInitData(invalid, BOT_TOKEN)).toBeNull();
  });

  it("rejects malformed hashes and oversized payloads", () => {
    const initData = createInitData();
    const malformed = initData.replace(/hash=[^&]+/, "hash=deadbeef");
    expect(validateTelegramInitData(malformed, BOT_TOKEN)).toBeNull();
    expect(validateTelegramInitData("x".repeat(8193), BOT_TOKEN)).toBeNull();
  });
});
