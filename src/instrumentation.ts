export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const globalForCleanup = globalThis as unknown as {
    __shafileCleanupStarted?: boolean;
  };
  if (globalForCleanup.__shafileCleanupStarted) return;
  globalForCleanup.__shafileCleanupStarted = true;

  const { ensureDataDirs } = await import("./lib/server/config");
  const { isCloudflareRuntime } = await import("./lib/server/runtime");
  const { getDb } = await import("./lib/server/db");
  const { runCleanup } = await import("./lib/server/shares");

  if (isCloudflareRuntime()) return;

  if (process.env.TRUST_PROXY !== "true") {
    console.warn(
      "[shafile] TRUST_PROXY is not enabled. Per-client rate limiting will collapse to a single bucket; set TRUST_PROXY=true when running behind a reverse proxy or tunnel.",
    );
  }
  ensureDataDirs();
  await getDb();
  void runCleanup();

  const interval = setInterval(() => {
    void runCleanup();
  }, 60 * 1000);
  interval.unref();
}
