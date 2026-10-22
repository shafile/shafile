import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SHARE_ID_PATTERN } from "@/lib/shared/limits";
import type { StorageDriver } from "./storage";

type R2ObjectBodyLike = {
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type R2BucketLike = {
  put(key: string, value: Uint8Array): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<unknown | null>;
  list(options: {
    prefix?: string;
    cursor?: string;
  }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
  delete(keys: string[]): Promise<void>;
};

type CloudflareAppEnv = {
  BLOB_BUCKET: R2BucketLike;
};

function assertId(id: string): void {
  if (!SHARE_ID_PATTERN.test(id)) throw new Error("Unsafe share id");
}

function prefix(id: string): string {
  assertId(id);
  return `shares/${id}/`;
}

function fileName(id: string, kind: "header" | "manifest" | "text"): string {
  return `${prefix(id)}${kind}.bin`;
}

function partName(id: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 1_000_000) {
    throw new Error("Unsafe part index");
  }
  return `${prefix(id)}parts/${String(index).padStart(6, "0")}.bin`;
}

async function bucket(): Promise<R2BucketLike> {
  const context = await getCloudflareContext({ async: true });
  const env = context.env as CloudflareAppEnv;
  if (!env.BLOB_BUCKET) throw new Error("R2 binding BLOB_BUCKET is missing");
  return env.BLOB_BUCKET;
}

async function readObject(key: string): Promise<Uint8Array> {
  const object = await (await bucket()).get(key);
  if (!object) throw new Error(`Missing R2 object ${key}`);
  return new Uint8Array(await object.arrayBuffer());
}

async function* shareChunks(id: string, chunkCount: number) {
  const store = await bucket();
  const keys = [
    fileName(id, "header"),
    ...Array.from({ length: chunkCount }, (_, index) => partName(id, index)),
    fileName(id, "manifest"),
  ];

  for (const key of keys) {
    const object = await store.get(key);
    if (!object) throw new Error(`Missing R2 object ${key}`);
    const reader = object.body.getReader();
    let complete = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          complete = true;
          break;
        }
        if (value) yield value;
      }
    } finally {
      if (!complete) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}

function streamFromAsync(iterable: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

export const cloudflareStorage: StorageDriver = {
  async writePart(id, index, data) {
    await (await bucket()).put(partName(id, index), data);
  },
  async writeHeader(id, data) {
    await (await bucket()).put(fileName(id, "header"), data);
  },
  async writeManifest(id, data) {
    await (await bucket()).put(fileName(id, "manifest"), data);
  },
  async writeText(id, data) {
    await (await bucket()).put(fileName(id, "text"), data);
  },
  async readHeader(id) {
    return readObject(fileName(id, "header"));
  },
  async readManifest(id) {
    return readObject(fileName(id, "manifest"));
  },
  async readText(id) {
    return readObject(fileName(id, "text"));
  },
  async partExists(id, index) {
    return Boolean(await (await bucket()).head(partName(id, index)));
  },
  async fileExists(id, kind) {
    return Boolean(await (await bucket()).head(fileName(id, kind)));
  },
  async deleteShare(id) {
    const store = await bucket();
    const scope = prefix(id);
    let cursor: string | undefined;
    do {
      const page = await store.list({ prefix: scope, cursor });
      const keys = page.objects.map((object) => object.key);
      if (keys.length > 0) await store.delete(keys);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  },
  async streamShare(id, chunkCount) {
    return streamFromAsync(shareChunks(id, chunkCount));
  },
};
