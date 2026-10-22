import { CHUNK_SIZE } from "@/lib/shared/limits";
import {
  encryptFileChunk,
  encryptManifest,
  createPlaintextHasher,
  type FileManifest,
} from "./crypto";
import {
  finalizeUpload,
  getUploadStatus,
  uploadPart,
} from "./api";

export type UploadProgress = {
  done: number;
  total: number;
};

type UploadArgs = {
  id: string;
  uploadToken: string;
  file: File;
  contentKey: Uint8Array;
  contentKeyHandle: CryptoKey;
  noncePrefix: Uint8Array;
  headerHash: Uint8Array;
  onProgress?: (progress: UploadProgress) => void;
};

async function uploadWithRetry(
  id: string,
  token: string,
  index: number,
  body: Uint8Array,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await uploadPart(id, token, index, body);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, 400 * 2 ** attempt),
        );
      }
    }
  }
  throw lastError;
}

export async function encryptAndUploadFile(
  args: UploadArgs,
): Promise<FileManifest> {
  const status = await getUploadStatus(args.id, args.uploadToken);
  const uploaded = new Set(status.uploaded);
  const alreadyFinalized = status.ready;
  const hasher = await createPlaintextHasher();
  hasher.init();
  const chunkCount = Math.max(1, Math.ceil(args.file.size / CHUNK_SIZE));

  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * CHUNK_SIZE;
    const end = Math.min(args.file.size, start + CHUNK_SIZE);
    const plaintext = new Uint8Array(await args.file.slice(start, end).arrayBuffer());
    hasher.update(plaintext);

    if (!alreadyFinalized && !uploaded.has(index)) {
      const frame = await encryptFileChunk(
        args.contentKeyHandle,
        plaintext,
        args.id,
        args.headerHash,
        args.noncePrefix,
        index,
        index === chunkCount - 1,
      );
      await uploadWithRetry(args.id, args.uploadToken, index, frame);
    }
    args.onProgress?.({ done: index + 1, total: chunkCount });
  }

  const manifest: FileManifest = {
    v: 1,
    name: args.file.name || "file",
    mime: args.file.type || "application/octet-stream",
    size: args.file.size,
    sha256: hasher.digest("hex"),
    chunkCount,
    chunkSize: CHUNK_SIZE,
  };

  const encryptedManifest = await encryptManifest(
    args.contentKey,
    manifest,
    args.id,
  );
  await finalizeUpload(args.id, args.uploadToken, encryptedManifest);
  return manifest;
}
