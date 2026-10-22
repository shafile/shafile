import { isCloudflareRuntime } from "./runtime";

export type ShareFileKind = "header" | "manifest" | "text" | "part";

export interface StorageDriver {
  writePart(id: string, index: number, data: Uint8Array): Promise<void>;
  writeHeader(id: string, data: Uint8Array): Promise<void>;
  writeManifest(id: string, data: Uint8Array): Promise<void>;
  writeText(id: string, data: Uint8Array): Promise<void>;
  readHeader(id: string): Promise<Uint8Array>;
  readManifest(id: string): Promise<Uint8Array>;
  readText(id: string): Promise<Uint8Array>;
  partExists(id: string, index: number): Promise<boolean>;
  fileExists(id: string, kind: "header" | "manifest" | "text"): Promise<boolean>;
  deleteShare(id: string): Promise<void>;
  streamShare(id: string, chunkCount: number): Promise<ReadableStream<Uint8Array>>;
}

const globalForStorage = globalThis as unknown as {
  __shafileStorage?: Promise<StorageDriver>;
};

export function getStorage(): Promise<StorageDriver> {
  if (!globalForStorage.__shafileStorage) {
    globalForStorage.__shafileStorage = isCloudflareRuntime()
      ? import("./storage.cloudflare").then((module) => module.cloudflareStorage)
      : import("./storage.node").then((module) => module.nodeStorage);
  }
  return globalForStorage.__shafileStorage;
}

export async function writePart(
  id: string,
  index: number,
  data: Uint8Array,
): Promise<void> {
  return (await getStorage()).writePart(id, index, data);
}

export async function writeHeader(id: string, data: Uint8Array): Promise<void> {
  return (await getStorage()).writeHeader(id, data);
}

export async function writeManifest(id: string, data: Uint8Array): Promise<void> {
  return (await getStorage()).writeManifest(id, data);
}

export async function writeTextBlob(id: string, data: Uint8Array): Promise<void> {
  return (await getStorage()).writeText(id, data);
}

export async function readHeader(id: string): Promise<Uint8Array> {
  return (await getStorage()).readHeader(id);
}

export async function readManifest(id: string): Promise<Uint8Array> {
  return (await getStorage()).readManifest(id);
}

export async function readTextBlob(id: string): Promise<Uint8Array> {
  return (await getStorage()).readText(id);
}

export async function partExists(id: string, index: number): Promise<boolean> {
  return (await getStorage()).partExists(id, index);
}

export async function fileExists(
  id: string,
  kind: "header" | "manifest" | "text",
): Promise<boolean> {
  return (await getStorage()).fileExists(id, kind);
}

export async function deleteShareBlobs(id: string): Promise<void> {
  return (await getStorage()).deleteShare(id);
}

export async function streamShareBlob(
  id: string,
  chunkCount: number,
): Promise<ReadableStream<Uint8Array>> {
  return (await getStorage()).streamShare(id, chunkCount);
}
