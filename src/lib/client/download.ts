import { ApiClientError } from "@/lib/shared/errors";
import {
  concatBytes,
  u32be,
} from "@/lib/shared/encoding";
import {
  CryptoError,
  createPlaintextHasher,
  decryptFileChunk,
  decryptManifest,
  hashFileHeader,
  importContentKey,
  parseFileHeader,
  type FileManifest,
} from "./crypto";
import { getDownloadResponse } from "./api";
import { sanitizeFileName } from "./format";
import type { ShareMeta } from "@/lib/shared/types";

const MEMORY_DECRYPT_LIMIT = 256 * 1024 * 1024;

type Writable = {
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
};

type FileHandle = {
  createWritable: () => Promise<Writable>;
};

type PickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: {
      description: string;
      accept: Record<string, string[]>;
    }[];
  }) => Promise<FileHandle>;
};

class StreamReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private leftover = new Uint8Array(0);

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  async readExact(length: number): Promise<Uint8Array> {
    const output = new Uint8Array(length);
    let offset = 0;

    if (this.leftover.length > 0) {
      const take = Math.min(this.leftover.length, length);
      output.set(this.leftover.subarray(0, take), 0);
      this.leftover = this.leftover.slice(take);
      offset = take;
    }

    while (offset < length) {
      const { done, value } = await this.reader.read();
      if (done) throw new CryptoError("Unexpected end of encrypted stream");
      if (!value) continue;
      const needed = length - offset;
      const take = Math.min(value.length, needed);
      output.set(value.subarray(0, take), offset);
      offset += take;
      if (take < value.length) this.leftover = value.slice(take);
    }

    return output;
  }

  async hasMore(): Promise<boolean> {
    if (this.leftover.length > 0) return true;
    const { done } = await this.reader.read();
    return !done;
  }
}

type DownloadArgs = {
  id: string;
  token: string;
  contentKey: Uint8Array;
  meta: ShareMeta;
  expectedManifest: FileManifest;
  signal?: AbortSignal;
  onProgress?: (decryptedBytes: number, totalBytes: number) => void;
};

type DownloadResult = {
  cancelled: boolean;
  fileName?: string;
  size?: number;
};

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeFileName(fileName);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadAndDecryptFile(
  args: DownloadArgs,
): Promise<DownloadResult> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  const useFileSystem = typeof picker === "function";

  if (!useFileSystem && args.expectedManifest.size > MEMORY_DECRYPT_LIMIT) {
    throw new ApiClientError("UNSUPPORTED_BROWSER");
  }

  let fileHandle: FileHandle | null = null;
  if (useFileSystem) {
    try {
      fileHandle = await picker.call(window, {
        suggestedName: sanitizeFileName(args.expectedManifest.name),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { cancelled: true };
      }
      throw error;
    }
  }

  const response = await getDownloadResponse(args.id, args.token, args.signal);
  if (!response.body) throw new ApiClientError("NETWORK_ERROR");

  const writable = fileHandle ? await fileHandle.createWritable() : null;
  const memoryChunks: Uint8Array[] = [];
  let succeeded = false;

  try {
    const reader = new StreamReader(response.body);
    const header = await reader.readExact(32);
    const parsed = parseFileHeader(header);
    if (
      args.meta.chunkSize !== null &&
      parsed.chunkSize !== args.meta.chunkSize
    ) {
      throw new CryptoError("Chunk size mismatch");
    }
    if (
      args.meta.chunkCount !== null &&
      args.expectedManifest.chunkCount !== args.meta.chunkCount
    ) {
      throw new CryptoError("Chunk count mismatch");
    }

    const headerHash = await hashFileHeader(header);
    const key = await importContentKey(args.contentKey);
    const hasher = await createPlaintextHasher();
    hasher.init();
    let decryptedBytes = 0;

    for (let index = 0; index < args.expectedManifest.chunkCount; index += 1) {
      const lengthPrefix = await reader.readExact(4);
      const length = new DataView(
        lengthPrefix.buffer,
        lengthPrefix.byteOffset,
        lengthPrefix.byteLength,
      ).getUint32(0, false);
      if (length < 16 || length > parsed.chunkSize + 16) {
        throw new CryptoError("Invalid encrypted chunk length");
      }
      const ciphertext = await reader.readExact(length);
      const frame = concatBytes(u32be(length), ciphertext);
      const plaintext = await decryptFileChunk(
        key,
        frame,
        args.id,
        headerHash,
        parsed.noncePrefix,
        index,
        index === args.expectedManifest.chunkCount - 1,
      );

      hasher.update(plaintext);
      decryptedBytes += plaintext.length;
      if (writable) await writable.write(plaintext);
      else memoryChunks.push(plaintext);
      args.onProgress?.(decryptedBytes, args.expectedManifest.size);
    }

    const manifestLengthPrefix = await reader.readExact(4);
    const manifestLength = new DataView(
      manifestLengthPrefix.buffer,
      manifestLengthPrefix.byteOffset,
      manifestLengthPrefix.byteLength,
    ).getUint32(0, false);
    if (manifestLength < 28 || manifestLength > 64 * 1024) {
      throw new CryptoError("Invalid manifest length");
    }
    const manifestBody = await reader.readExact(manifestLength);
    const streamedManifest = await decryptManifest(
      args.contentKey,
      concatBytes(u32be(manifestLength), manifestBody),
      args.id,
    );

    if (await reader.hasMore()) {
      throw new CryptoError("Unexpected trailing data");
    }

    if (
      streamedManifest.sha256 !== args.expectedManifest.sha256 ||
      streamedManifest.size !== args.expectedManifest.size ||
      streamedManifest.chunkCount !== args.expectedManifest.chunkCount ||
      decryptedBytes !== args.expectedManifest.size
    ) {
      throw new CryptoError("Manifest verification failed");
    }

    const digest = hasher.digest("hex");
    if (digest !== args.expectedManifest.sha256) {
      throw new CryptoError("Plaintext hash mismatch");
    }

    if (writable) {
      await writable.close();
    } else {
      const blob = new Blob(memoryChunks as unknown as BlobPart[], {
        type: args.expectedManifest.mime || "application/octet-stream",
      });
      triggerBlobDownload(blob, args.expectedManifest.name);
    }

    succeeded = true;
    return {
      cancelled: false,
      fileName: args.expectedManifest.name,
      size: args.expectedManifest.size,
    };
  } catch (error) {
    if (writable) await writable.abort().catch(() => undefined);
    throw error;
  } finally {
    if (!succeeded && !writable) memoryChunks.length = 0;
  }
}

export function downloadTextFile(
  text: string,
  fileName = "shafile-note.md",
): void {
  triggerBlobDownload(new Blob([text], { type: "text/markdown;charset=utf-8" }), fileName);
}
