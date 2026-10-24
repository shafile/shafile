import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        url: "http://127.0.0.1:3000/api/health",
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          IP_HASH_SECRET: `e2e-${Date.now()}`,
          TELEGRAM_BOT_TOKEN: "e2e-telegram-bot-token",
          TELEGRAM_WEBHOOK_SECRET: "e2e-telegram-webhook-secret",
          TELEGRAM_BOT_USERNAME: "e2e_telegram_bot",
          TELEGRAM_MINI_APP_SHORT_NAME: "shafile",
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
