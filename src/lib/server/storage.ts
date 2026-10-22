import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { SHARE_ID_PATTERN } from "@/lib/shared/limits";
import { ensureDataDirs, serverConfig } from "./config";

function assertShareId(id: string): void {
  if (!SHARE_ID_PATTERN.test(id)) throw new Error("Unsafe share id");
}

export function shareBlobDir(id: string): string {
  assertShareId(id);
  return join(serverConfig.blobDir, id);
}

export function uploadTempDir(id: string): string {
  assertShareId(id);
  return join(serverConfig.tmpDir, id);
}

export function textBlobPath(id: string): string {
  return join(shareBlobDir(id), "text.bin");
}

export function headerBlobPath(id: string): string {
  return join(shareBlobDir(id), "header.bin");
}

export function manifestBlobPath(id: string): string {
  return join(shareBlobDir(id), "manifest.bin");
}

export function tempHeaderPath(id: string): string {
  return join(uploadTempDir(id), "header.bin");
}

export function tempManifestPath(id: string): string {
  return join(uploadTempDir(id), "manifest.bin");
}

export function partBlobPath(id: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 1_000_000) {
    throw new Error("Unsafe part index");
  }
  return join(shareBlobDir(id), "parts", `${String(index).padStart(6, "0")}.bin`);
}

export function tempPartPath(id: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 1_000_000) {
    throw new Error("Unsafe part index");
  }
  return join(
    uploadTempDir(id),
    "parts",
    `${String(index).padStart(6, "0")}.bin`,
  );
}

export async function writeAtomic(
  destination: string,
  data: Uint8Array,
): Promise<void> {
  ensureDataDirs();
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(temporary, data);
  await rename(temporary, destination);
}

export async function writePart(
  shareId: string,
  index: number,
  data: Uint8Array,
): Promise<void> {
  await writeAtomic(tempPartPath(shareId, index), data);
}

export async function writeTextBlob(id: string, data: Uint8Array): Promise<void> {
  await writeAtomic(textBlobPath(id), data);
}

export async function writeTempHeader(id: string, data: Uint8Array): Promise<void> {
  await writeAtomic(tempHeaderPath(id), data);
}

export async function writeTempManifest(
  id: string,
  data: Uint8Array,
): Promise<void> {
  await writeAtomic(tempManifestPath(id), data);
}

export async function readBlob(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path));
}

export async function fileSize(path: string): Promise<number | null> {
  try {
    const result = await stat(path);
    return result.isFile() ? result.size : null;
  } catch {
    return null;
  }
}

export async function fileExists(path: string): Promise<boolean> {
  return (await fileSize(path)) !== null;
}

export function createBlobReadStream(path: string) {
  return createReadStream(path);
}

export async function deleteShareBlobs(id: string): Promise<void> {
  await rm(shareBlobDir(id), { recursive: true, force: true });
}

export async function deleteUploadTemp(id: string): Promise<void> {
  await rm(uploadTempDir(id), { recursive: true, force: true });
}

export async function promoteUpload(id: string): Promise<void> {
  const source = uploadTempDir(id);
  const destination = shareBlobDir(id);
  await mkdir(dirname(destination), { recursive: true });
  await rename(source, destination);
}
