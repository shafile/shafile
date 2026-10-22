import { dirname, join } from "node:path";
import { serverConfig } from "./config";
import { SHARE_ID_PATTERN } from "@/lib/shared/limits";
import type { StorageDriver } from "./storage";

type FsPromises = typeof import("node:fs/promises");

function fsp(): FsPromises {
  const fsPromises = process.getBuiltinModule("node:fs/promises") as
    | FsPromises
    | undefined;
  if (!fsPromises) throw new Error("node:fs/promises is unavailable");
  return fsPromises;
}

function assertId(id: string): void {
  if (!SHARE_ID_PATTERN.test(id)) throw new Error("Unsafe share id");
}

function shareDir(id: string): string {
  assertId(id);
  return join(serverConfig.blobDir, id);
}

function fileName(
  id: string,
  kind: "header" | "manifest" | "text",
): string {
  return join(shareDir(id), `${kind}.bin`);
}

function partName(id: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 1_000_000) {
    throw new Error("Unsafe part index");
  }
  return join(shareDir(id), "parts", `${String(index).padStart(6, "0")}.bin`);
}

async function atomicWrite(destination: string, data: Uint8Array): Promise<void> {
  const { mkdir, rename, writeFile } = fsp();
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${crypto.randomUUID()}`;
  await writeFile(temporary, data);
  await rename(temporary, destination);
}

async function exists(path: string): Promise<boolean> {
  try {
    const info = await fsp().stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

async function* shareChunks(id: string, chunkCount: number) {
  const { open } = fsp();
  const paths = [
    fileName(id, "header"),
    ...Array.from({ length: chunkCount }, (_, index) => partName(id, index)),
    fileName(id, "manifest"),
  ];
  for (const path of paths) {
    const handle = await open(path, "r");
    try {
      const buffer = new Uint8Array(64 * 1024);
      while (true) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        yield buffer.slice(0, bytesRead);
      }
    } finally {
      await handle.close();
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

export const nodeStorage: StorageDriver = {
  async writePart(id, index, data) {
    await atomicWrite(partName(id, index), data);
  },
  async writeHeader(id, data) {
    await atomicWrite(fileName(id, "header"), data);
  },
  async writeManifest(id, data) {
    await atomicWrite(fileName(id, "manifest"), data);
  },
  async writeText(id, data) {
    await atomicWrite(fileName(id, "text"), data);
  },
  async readHeader(id) {
    return new Uint8Array(await fsp().readFile(fileName(id, "header")));
  },
  async readManifest(id) {
    return new Uint8Array(await fsp().readFile(fileName(id, "manifest")));
  },
  async readText(id) {
    return new Uint8Array(await fsp().readFile(fileName(id, "text")));
  },
  async partExists(id, index) {
    return exists(partName(id, index));
  },
  async fileExists(id, kind) {
    return exists(fileName(id, kind));
  },
  async deleteShare(id) {
    const { rm } = fsp();
    assertId(id);
    await rm(shareDir(id), { recursive: true, force: true });
  },
  async streamShare(id, chunkCount) {
    return streamFromAsync(shareChunks(id, chunkCount));
  },
};
