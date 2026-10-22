import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

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
