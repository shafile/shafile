import { createHash, createHmac, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const TELEGRAM_BOT_TOKEN = "e2e-telegram-bot-token";

async function installTelegramMock(page: Page, initData: string): Promise<void> {
  await page.addInitScript((data: string) => {
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: data,
        initDataUnsafe: { user: { language_code: "en" } },
        colorScheme: "light",
        themeParams: { bg_color: "#ffffff", text_color: "#000000" },
        ready() {},
        expand() {},
        onEvent() {},
        offEvent() {},
        openTelegramLink() {},
        openLink() {},
        BackButton: {
          show() {},
          hide() {},
          onClick() {},
          offClick() {},
        },
      },
    };
  }, initData);
}

function randomTelegramUserId(): number {
  return Math.floor(Math.random() * 1_000_000_000) + 1;
}

function createTelegramInitData(
  authDate = Math.floor(Date.now() / 1000),
  userId = 123456789,
): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAH-e2e",
    user: JSON.stringify({
      id: userId,
      first_name: "E2E",
      language_code: "en",
    }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData")
    .update(TELEGRAM_BOT_TOKEN)
    .digest();
  params.set(
    "hash",
    createHmac("sha256", secret).update(dataCheckString).digest("hex"),
  );
  return params.toString();
}

async function createTextShare(
  page: Page,
  text: string,
  options: { password?: string; views?: string } = {},
) {
  await page.goto("/create");
  await page.getByLabel("Note").fill(text);
  if (options.password) {
    await page.getByRole("button", { name: /Password protected/i }).click();
    await page.locator("#share-password").fill(options.password);
  }
  if (options.views) {
    await page.locator("#views-select").selectOption(options.views);
  }
  await page.getByRole("button", { name: /Encrypt and create/i }).click();
  await expect(page.getByTestId("share-link")).toBeVisible();
  return (await page.getByTestId("share-link").textContent())!.trim();
}

test("one-time text share is decrypted in the browser and then burned", async ({
  page,
}) => {
  const secret = `# Quarterly plan\n\nOnly for you.\n\n<script>window.__xss = true</script>`;
  const link = await createTextShare(page, secret);
  expect(link).toContain("#k=");

  await page.goto(link);
  await expect(page.getByTestId("view-text")).toBeVisible();
  await page.getByTestId("view-text").click();

  const heading = page.locator(".markdown-body h1");
  await expect(heading).toHaveText("Quarterly plan");
  await expect(page.getByText("Only for you.")).toBeVisible();
  expect(await page.evaluate(() => (window as { __xss?: boolean }).__xss)).toBeUndefined();

  await page.reload();
  await expect(page.getByText("Burned after reading")).toBeVisible();
});

test("fenced code blocks are highlighted after decryption", async ({ page }) => {
  const link = await createTextShare(
    page,
    "# Code\n\n```js\nconst answer = 42;\n```",
    { views: "3" },
  );

  await page.goto(link);
  await page.getByTestId("view-text").click();
  await expect(page.locator(".markdown-body pre code.hljs")).toBeVisible();
  await expect(page.locator(".hljs-keyword").first()).toHaveText("const");
});

test("password share rejects a wrong password and does not burn a view", async ({
  page,
}) => {
  const link = await createTextShare(page, "## Private note\n\nPassword protected.", {
    password: "correct horse battery",
    views: "3",
  });
  expect(link).not.toContain("#k=");

  await page.goto(link);
  await page.locator("#unlock-password").fill("wrong password");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByText("That password did not work.")).toBeVisible();

  await page.locator("#unlock-password").fill("correct horse battery");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByTestId("view-text")).toBeVisible();
  await page.getByTestId("view-text").click();
  await expect(page.locator(".markdown-body h2")).toHaveText("Private note");
  await expect(page.getByText("2 views left")).toBeVisible();
});

test("file upload shows encrypted manifest and streams a verified download", async ({
  page,
  context,
}) => {
  const content = randomBytes(4 * 1024 * 1024 + 321);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  await page.addInitScript(() => {
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker =
      async () => ({
        createWritable: async () => {
          const chunks: Uint8Array[] = [];
          return {
            write: async (data: Uint8Array) => {
              chunks.push(new Uint8Array(data));
            },
            close: async () => {
              const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
              const merged = new Uint8Array(total);
              let offset = 0;
              for (const chunk of chunks) {
                merged.set(chunk, offset);
                offset += chunk.length;
              }
              const digest = await crypto.subtle.digest("SHA-256", merged);
              const hash = Array.from(new Uint8Array(digest))
                .map((byte) => byte.toString(16).padStart(2, "0"))
                .join("");
              (window as unknown as { __saved: unknown }).__saved = {
                size: total,
                hash,
              };
            },
            abort: async () => undefined,
          };
        },
      });
  });

  await page.goto("/create");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "playwright-file.bin",
    mimeType: "application/octet-stream",
    buffer: content,
  });
  await page.getByRole("button", { name: /Encrypt and create/i }).click();
  await expect(page.getByTestId("share-link")).toBeVisible({ timeout: 60_000 });
  const link = (await page.getByTestId("share-link").textContent())!.trim();

  const sharePage = await context.newPage();
  await sharePage.addInitScript(() => {
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker =
      async () => ({
        createWritable: async () => {
          const chunks: Uint8Array[] = [];
          return {
            write: async (data: Uint8Array) => {
              chunks.push(new Uint8Array(data));
            },
            close: async () => {
              const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
              const merged = new Uint8Array(total);
              let offset = 0;
              for (const chunk of chunks) {
                merged.set(chunk, offset);
                offset += chunk.length;
              }
              const digest = await crypto.subtle.digest("SHA-256", merged);
              const hash = Array.from(new Uint8Array(digest))
                .map((byte) => byte.toString(16).padStart(2, "0"))
                .join("");
              (window as unknown as { __saved: unknown }).__saved = {
                size: total,
                hash,
              };
            },
            abort: async () => undefined,
          };
        },
      });
  });
  await sharePage.goto(link);
  await expect(sharePage.getByText("playwright-file.bin")).toBeVisible();
  await sharePage.getByTestId("download-file").click();
  await expect(sharePage.getByText("Download complete")).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(() =>
      sharePage.evaluate(
        () => (window as unknown as { __saved?: { size: number; hash: string } }).__saved,
      ),
    )
    .toEqual({ size: content.length, hash: expectedHash });

  await sharePage.reload();
  await expect(sharePage.getByText("Burned after reading")).toBeVisible();
});

test("management entry can revoke a share", async ({ page }) => {
  const link = await createTextShare(page, "Temporary note");
  await page.goto("/manage");
  await expect(page.getByRole("heading", { name: "My shares" })).toBeVisible();
  await page.getByRole("button", { name: "Revoke", exact: true }).first().click();
  await page.getByRole("button", { name: "Revoke share", exact: true }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();

  await page.goto(link);
  await expect(page.getByText("This share was revoked")).toBeVisible();
});

test.describe("japanese locale", () => {
  test.use({ locale: "ja-JP" });

  test("auto-detects japanese and can switch to english", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "一度だけ共有して、消す。",
    );

    await page.getByRole("button", { name: "言語を選択" }).click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Share it once. Then it’s gone.",
    );

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Share it once. Then it’s gone.",
    );
  });
});

test("switching language keeps the decrypted note on screen", async ({ page }) => {
  const link = await createTextShare(page, "Locale switch note", { views: "3" });
  await page.goto(link);
  await page.getByTestId("view-text").click();
  await expect(page.getByText("Locale switch note")).toBeVisible();

  await page.getByRole("button", { name: "Choose language" }).click();
  await page.getByRole("menuitemradio", { name: "简体中文" }).click();
  await expect(page.getByText("Locale switch note")).toBeVisible();
  await expect(page.getByRole("link", { name: "我的分享" })).toBeVisible();
  await expect(page.getByRole("button", { name: "选择语言" })).toBeVisible();
});

test("a management link can be imported into a fresh browser", async ({
  browser,
  page,
}) => {
  await createTextShare(page, "Managed elsewhere", { views: "3" });
  const manageLink = (await page.getByTestId("manage-link").textContent())!.trim();

  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await freshPage.goto(manageLink);
  await expect(freshPage.getByRole("heading", { name: "My shares" })).toBeVisible();
  await expect(freshPage.getByText("Management entry added.")).toBeVisible();
  await expect(freshPage.getByText("Ready", { exact: true })).toBeVisible();
  await fresh.close();
});

test("a scheduled share is not available before its start time", async ({
  page,
}) => {
  await page.goto("/create");
  await page.getByLabel("Note").fill("Scheduled note");
  await page.locator("#start-mode").selectOption("scheduled");
  const start = new Date(Date.now() + 3 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const value = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
  await page.locator("#start-at").fill(value);
  await page.locator("#views-select").selectOption("3");
  await page.getByRole("button", { name: /Encrypt and create/i }).click();
  await expect(page.getByTestId("share-link")).toBeVisible();
  const link = (await page.getByTestId("share-link").textContent())!.trim();

  await page.goto(link);
  await expect(page.getByText("Not available yet")).toBeVisible();
  await expect(page.getByText(/Starts .*minute/)).toBeVisible();
});

test.describe("arabic locale", () => {
  test.use({ locale: "ar" });

  test("renders right-to-left and switches back to english", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "شاركها مرة واحدة",
    );

    await page.getByRole("button", { name: "اختيار اللغة" }).click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Share it once",
    );
  });
});

test.describe("mobile layout", () => {
  test.use({
    viewport: { width: 320, height: 700 },
    hasTouch: true,
    isMobile: true,
    locale: "fr-FR",
  });

  test("pages fit the viewport without horizontal scrolling", async ({ page }) => {
    for (const path of ["/", "/create", "/manage"]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("telegram mini app", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { Telegram: unknown }).Telegram = {
        WebApp: {
          initData: "query_id=test&user=%7B%22language_code%22%3A%22en%22%7D",
          colorScheme: "dark",
          themeParams: {
            bg_color: "#101418",
            secondary_bg_color: "#1b2228",
            text_color: "#f5f5f5",
            hint_color: "#a0a8ae",
            link_color: "#6ab3f3",
            button_color: "#3390ec",
            button_text_color: "#ffffff",
          },
          safeAreaInset: { top: 52, bottom: 24, left: 0, right: 0 },
          contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
          ready() {},
          expand() {},
          onEvent() {},
          offEvent() {},
          openTelegramLink() {},
          openLink(url: string) {
            (window as unknown as { __tgLink?: string }).__tgLink = url;
          },
          setHeaderColor(color: string) {
            (window as unknown as { __tgHeader?: string }).__tgHeader = color;
          },
          setBackgroundColor(color: string) {
            (window as unknown as { __tgBackground?: string }).__tgBackground =
              color;
          },
          enableClosingConfirmation() {},
          disableClosingConfirmation() {},
          BackButton: {
            show() {},
            hide() {},
            onClick() {},
            offClick() {},
          },
        },
      };
    });
  });

  test("applies the telegram theme and safe areas", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-tg", "1");
    await expect(page.locator("html")).toHaveAttribute("data-tg-ready", "1");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".theme-toggle")).toBeHidden();

    const values = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        background: style.getPropertyValue("--background").trim(),
        safeTop: style.getPropertyValue("--tg-safe-top").trim(),
        header: (window as unknown as { __tgHeader?: string }).__tgHeader,
        chrome: (window as unknown as { __tgBackground?: string }).__tgBackground,
      };
    });
    expect(values.background).toBe("#101418");
    expect(values.safeTop).toBe("52px");
    expect(values.header).toBe("#101418");
    expect(values.chrome).toBe("#101418");
  });

  test("shows the functional mini app home instead of the marketing page", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-tg", "1");
    await expect(page.locator(".tg-home")).toBeVisible();
    await expect(page.locator(".web-home")).toBeHidden();
  });

  test("shares the mini app from home", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-tg-ready", "1");
    await page.evaluate(() => {
      const app = (
        window as unknown as {
          Telegram: { WebApp: Record<string, unknown> };
        }
      ).Telegram.WebApp;
      app.openTelegramLink = (url: string) => {
        (window as unknown as { __tgShare: string }).__tgShare = url;
      };
    });

    await page
      .getByRole("button", { name: "Share Shafile", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const value = (window as unknown as { __tgShare?: string })
            .__tgShare;
          if (!value) return null;
          try {
            return new URL(value).searchParams.get("url");
          } catch {
            return null;
          }
        }),
      )
      .toBe("https://t.me/e2e_telegram_bot/shafile");
  });

  test("keeps the browser language when telegram language differs", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (
        window as unknown as {
          Telegram: {
            WebApp: { initDataUnsafe: { user: { language_code: string } } };
          };
        }
      ).Telegram.WebApp.initDataUnsafe = {
        user: { language_code: "zh-CN" },
      };
    });

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("keeps the share key readable with telegram hash parameters", async ({
    page,
  }) => {
    const link = await createTextShare(page, "Telegram note", { views: "3" });
    await page.goto(`${link}&tgWebAppData=query_id%3D1&tgWebAppVersion=8.0`);
    await expect(page.locator("html")).toHaveAttribute("data-tg", "1");
    await page.getByTestId("view-text").click();
    await expect(page.getByText("Telegram note")).toBeVisible();
  });

  test("shares a link through telegram", async ({ page }) => {
    await createTextShare(page, "Telegram share", { views: "3" });
    await page.evaluate(() => {
      const app = (
        window as unknown as {
          Telegram: { WebApp: Record<string, unknown> };
        }
      ).Telegram.WebApp;
      app.openTelegramLink = (url: string) => {
        (window as unknown as { __tgShare: string }).__tgShare = url;
      };
    });

    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __tgShare?: string }).__tgShare,
        ),
      )
      .toContain("https://t.me/share/url?url=");
  });

  test("shares a password share as a mini app deep link", async ({ page }) => {
    const link = await createTextShare(page, "Password mini app", {
      password: "correct horse battery",
      views: "3",
    });
    const id = new URL(link).pathname.split("/").pop()!;
    await page.evaluate(() => {
      const app = (
        window as unknown as {
          Telegram: { WebApp: Record<string, unknown> };
        }
      ).Telegram.WebApp;
      app.openTelegramLink = (url: string) => {
        (window as unknown as { __tgShare: string }).__tgShare = url;
      };
    });

    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const value = (window as unknown as { __tgShare?: string })
            .__tgShare;
          if (!value) return null;
          try {
            return new URL(value).searchParams.get("url");
          } catch {
            return null;
          }
        }),
      )
      .toBe(`https://t.me/e2e_telegram_bot/shafile?startapp=${id}`);
  });

  test("opens a password share from a telegram startapp link", async ({
    page,
  }) => {
    const link = await createTextShare(page, "Start param password", {
      password: "correct horse battery",
      views: "3",
    });
    const id = new URL(link).pathname.split("/").pop()!;

    await page.goto(`/?tgWebAppStartParam=${id}`);
    await expect(page).toHaveURL(new RegExp(`/s/${id}`));
    await expect(page.locator("#unlock-password")).toBeVisible();
  });

  test("shows the telegram key-missing message for a link share startapp", async ({
    page,
  }) => {
    const link = await createTextShare(page, "Start param link", {
      views: "3",
    });
    const id = new URL(link).pathname.split("/").pop()!;

    await page.goto(`/?tgWebAppStartParam=${id}`);
    await expect(page).toHaveURL(new RegExp(`/s/${id}`));
    await expect(
      page.getByText(/does not include the decryption key/),
    ).toBeVisible();
  });

  test("opens external markdown links inside telegram", async ({ page }) => {
    const link = await createTextShare(
      page,
      "[Example](https://example.com/path?q=1)",
    );
    await page.goto(link);
    await page.getByTestId("view-text").click();
    const anchor = page.getByRole("link", { name: "Example" });
    await expect(anchor).toBeVisible();
    await anchor.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __tgLink?: string }).__tgLink,
        ),
      )
      .toBe("https://example.com/path?q=1");
  });
});

test.describe("mobile share flow", () => {
  test.use({
    viewport: { width: 360, height: 740 },
    hasTouch: true,
    isMobile: true,
    locale: "en-US",
  });

  test("creates and decrypts a share on a narrow screen", async ({ page }) => {
    const link = await createTextShare(page, "Mobile note");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.goto(link);
    await page.getByTestId("view-text").click();
    await expect(page.locator(".markdown-body")).toContainText("Mobile note");
  });
});

test.describe("telegram identity", () => {
  test("returns the configured mini app link", async ({ request }) => {
    const response = await request.get("/api/telegram/app");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { url?: string | null };
    expect(body.url).toBe("https://t.me/e2e_telegram_bot/shafile");
  });

  test("exchanges valid initData for a session and rejects tampering", async ({
    request,
  }) => {
    const userId = randomTelegramUserId();
    const initData = createTelegramInitData(undefined, userId);
    const response = await request.post("/api/telegram/session", {
      data: { initData },
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      token?: string;
      expiresIn?: number;
    };
    expect(body.token).toBeTruthy();
    expect(body.expiresIn).toBe(3600);
    expect(JSON.stringify(body)).not.toContain(initData);

    const tampered = initData.replace(
      encodeURIComponent(`"id":${userId}`),
      encodeURIComponent(`"id":${userId + 1}`),
    );
    expect(tampered).not.toBe(initData);
    const tamperedResponse = await request.post("/api/telegram/session", {
      data: { initData: tampered },
    });
    expect(tamperedResponse.status()).toBe(401);

    const stale = createTelegramInitData(
      Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 1000),
      randomTelegramUserId(),
    );
    const staleResponse = await request.post("/api/telegram/session", {
      data: { initData: stale },
    });
    expect(staleResponse.status()).toBe(401);
  });

  test("attaches ownership, lists, and revokes by session", async ({
    request,
  }) => {
    const sessionResponse = await request.post("/api/telegram/session", {
      data: {
        initData: createTelegramInitData(undefined, randomTelegramUserId()),
      },
    });
    expect(sessionResponse.status()).toBe(200);
    const { token } = (await sessionResponse.json()) as { token: string };

    const id = randomBytes(16).toString("base64url");
    const payload = randomBytes(64).toString("base64url");
    const created = await request.post("/api/shares", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        kind: "text",
        id,
        startAt: null,
        expiresAt: null,
        maxViews: 3,
        password: null,
        payload,
      },
    });
    expect(created.status()).toBe(201);

    const listed = await request.get("/api/telegram/shares", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listed.status()).toBe(200);
    const listedBody = (await listed.json()) as {
      items: { id: string; status: string }[];
    };
    expect(listedBody.items.some((item) => item.id === id)).toBe(true);

    const otherSession = await request.post("/api/telegram/session", {
      data: {
        initData: createTelegramInitData(
          undefined,
          randomTelegramUserId(),
        ),
      },
    });
    const { token: otherToken } = (await otherSession.json()) as {
      token: string;
    };
    const otherList = await request.get("/api/telegram/shares", {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    const otherBody = (await otherList.json()) as {
      items: { id: string }[];
    };
    expect(otherBody.items.some((item) => item.id === id)).toBe(false);

    const forbidden = await request.post(`/api/shares/${id}/revoke`, {
      headers: { Authorization: `Bearer ${otherToken}` },
      data: {},
    });
    expect(forbidden.status()).toBe(403);

    const revoked = await request.post(`/api/shares/${id}/revoke`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    expect(revoked.status()).toBe(200);

    const after = await request.get("/api/telegram/shares", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const afterBody = (await after.json()) as {
      items: { id: string; status: string }[];
    };
    expect(
      afterBody.items.find((item) => item.id === id)?.status,
    ).toBe("revoked");
  });

  test("adopts an unowned share with a manage token", async ({ request }) => {
    const userId = randomTelegramUserId();
    const sessionResponse = await request.post("/api/telegram/session", {
      data: { initData: createTelegramInitData(undefined, userId) },
    });
    const { token } = (await sessionResponse.json()) as { token: string };

    const id = randomBytes(16).toString("base64url");
    const created = await request.post("/api/shares", {
      data: {
        kind: "text",
        id,
        startAt: null,
        expiresAt: null,
        maxViews: 3,
        password: null,
        payload: randomBytes(64).toString("base64url"),
      },
    });
    expect(created.status()).toBe(201);
    const { manageToken } = (await created.json()) as {
      manageToken: string;
    };

    const adopted = await request.post("/api/telegram/adopt", {
      headers: { Authorization: `Bearer ${token}` },
      data: { items: [{ id, manageToken }] },
    });
    expect(adopted.status()).toBe(200);
    expect(await adopted.json()).toEqual({ linked: 1, skipped: 0 });

    const listed = await request.get("/api/telegram/shares", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listedBody = (await listed.json()) as {
      items: { id: string }[];
    };
    expect(listedBody.items.some((item) => item.id === id)).toBe(true);

    const otherSession = await request.post("/api/telegram/session", {
      data: {
        initData: createTelegramInitData(
          undefined,
          randomTelegramUserId(),
        ),
      },
    });
    const { token: otherToken } = (await otherSession.json()) as {
      token: string;
    };
    const stolen = await request.post("/api/telegram/adopt", {
      headers: { Authorization: `Bearer ${otherToken}` },
      data: { items: [{ id, manageToken }] },
    });
    expect(await stolen.json()).toEqual({ linked: 0, skipped: 1 });
  });

  test("lists and revokes an owned share from a fresh session", async ({
    browser,
    page,
  }) => {
    const userId = randomTelegramUserId();
    const initData = createTelegramInitData(undefined, userId);
    await installTelegramMock(page, initData);
    const link = await createTextShare(page, "Cross device note", {
      views: "3",
    });
    const id = new URL(link).pathname.split("/").pop()!;

    const fresh = await browser.newContext();
    const freshPage = await fresh.newPage();
    await installTelegramMock(freshPage, initData);
    await freshPage.goto("/manage");
    await expect(
      freshPage.getByRole("heading", { name: "Telegram account" }),
    ).toBeVisible();
    const article = freshPage.locator("article").filter({ hasText: id });
    await expect(article).toBeVisible();

    await article
      .getByRole("button", { name: "Revoke", exact: true })
      .click();
    await freshPage
      .getByRole("button", { name: "Revoke share", exact: true })
      .click();
    await expect(
      article.getByText("Revoked", { exact: true }),
    ).toBeVisible();
    await fresh.close();
  });

  test("links local shares to Telegram from the manage page", async ({
    browser,
    page,
  }) => {
    const userId = randomTelegramUserId();
    const initData = createTelegramInitData(undefined, userId);
    const link = await createTextShare(page, "Adopt note", { views: "3" });
    const id = new URL(link).pathname.split("/").pop()!;

    await installTelegramMock(page, initData);
    await page.goto("/manage");
    await expect(
      page.getByRole("heading", { name: "Telegram account" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Link this browser's shares", exact: true })
      .click();
    await expect(page.getByText(/shares linked to Telegram/)).toBeVisible();

    const fresh = await browser.newContext();
    const freshPage = await fresh.newPage();
    await installTelegramMock(freshPage, initData);
    await freshPage.goto("/manage");
    await expect(
      freshPage.locator("article").filter({ hasText: id }),
    ).toBeVisible();
    await fresh.close();
  });
});

test.describe("telegram webhook", () => {
  test("requires the webhook secret", async ({ request }) => {
    const missing = await request.post("/api/telegram/webhook", {
      data: { update_id: 1 },
    });
    expect(missing.status()).toBe(401);

    const wrong = await request.post("/api/telegram/webhook", {
      headers: {
        "x-telegram-bot-api-secret-token": "wrong-secret",
      },
      data: { update_id: 1 },
    });
    expect(wrong.status()).toBe(401);

    const ok = await request.post("/api/telegram/webhook", {
      headers: {
        "x-telegram-bot-api-secret-token": "e2e-telegram-webhook-secret",
      },
      data: { update_id: 1 },
    });
    expect(ok.status()).toBe(200);
  });
});
