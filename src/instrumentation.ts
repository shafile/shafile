export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const globalForCleanup = globalThis as unknown as {
    __shafileCleanupStarted?: boolean;
  };
  if (globalForCleanup.__shafileCleanupStarted) return;
  globalForCleanup.__shafileCleanupStarted = true;

  const { ensureDataDirs } = await import("./lib/server/config");
  const { getDb } = await import("./lib/server/db");
  const { runCleanup } = await import("./lib/server/shares");

  ensureDataDirs();
  getDb();
  void runCleanup();

  const interval = setInterval(() => {
    void runCleanup();
  }, 10 * 60 * 1000);
  interval.unref();
}
