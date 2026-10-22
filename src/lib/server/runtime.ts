export function isCloudflareRuntime(): boolean {
  return process.env.SHAFILE_RUNTIME === "cloudflare";
}

export async function keepAlive(promise: Promise<unknown>): Promise<void> {
  if (!isCloudflareRuntime()) {
    await promise;
    return;
  }

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    context.ctx.waitUntil(
      promise.catch((error) => {
        console.error("[shafile] post-response task failed", error);
      }),
    );
  } catch (error) {
    console.error("[shafile] keeping task alive failed", error);
    await promise;
  }
}