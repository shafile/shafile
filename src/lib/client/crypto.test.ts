import { describe, expect, it } from "vitest";
import {
  CryptoError,
  buildFileHeader,
  createPasswordEnvelope,
  decryptFileChunk,
  decryptManifest,
  decryptText,
  encodeContentKey,
  decodeContentKey,
  encryptFileChunk,
  encryptManifest,
  encryptText,
  generateContentKey,
  hashFileHeader,
  importContentKey,
  parseFileHeader,
  sha256,
  unlockContentKey,
  type FileManifest,
} from "./crypto";

const shareId = "abcdefghijklmnopqrstuv";

describe("text encryption", () => {
  it("round-trips and binds the share id", async () => {
    const key = generateContentKey();
    const payload = await encryptText(key, "你好, shafile\n\n**secret**", shareId);
    expect(await decryptText(key, payload, shareId)).toContain("**secret**");
    await expect(decryptText(key, payload, "zzzzzzzzzzzzzzzzzzzzzz")).rejects.toBeInstanceOf(
      CryptoError,
    );
  });

  it("rejects tampered ciphertext", async () => {
    const key = generateContentKey();
    const payload = await encryptText(key, "secret", shareId);
    payload[payload.length - 1] ^= 0xff;
    await expect(decryptText(key, payload, shareId)).rejects.toBeInstanceOf(CryptoError);
  });

  it("round-trips content keys through the link format", () => {
    const key = generateContentKey();
    expect(decodeContentKey(encodeContentKey(key))).toEqual(key);
  });
});

describe("file encryption", () => {
  it("round-trips chunks and rejects reordering", async () => {
    const key = generateContentKey();
    const keyHandle = await importContentKey(key);
    const noncePrefix = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const fileId = new Uint8Array(16).fill(9);
    const header = buildFileHeader(1024, noncePrefix, fileId);
    const parsed = parseFileHeader(header);
    const headerHash = await hashFileHeader(header);
    const chunks = [
      new TextEncoder().encode("first chunk"),
      new TextEncoder().encode("second chunk"),
      new TextEncoder().encode("last"),
    ];

    const frames = await Promise.all(
      chunks.map((chunk, index) =>
        encryptFileChunk(
          keyHandle,
          chunk,
          shareId,
          headerHash,
          parsed.noncePrefix,
          index,
          index === chunks.length - 1,
        ),
      ),
    );

    const decrypted = await Promise.all(
      frames.map((frame, index) =>
        decryptFileChunk(
          keyHandle,
          frame,
          shareId,
          headerHash,
          parsed.noncePrefix,
          index,
          index === chunks.length - 1,
        ),
      ),
    );
    expect(decrypted.map((chunk) => new TextDecoder().decode(chunk))).toEqual([
      "first chunk",
      "second chunk",
      "last",
    ]);

    await expect(
      decryptFileChunk(
        keyHandle,
        frames[1]!,
        shareId,
        headerHash,
        parsed.noncePrefix,
        0,
        false,
      ),
    ).rejects.toBeInstanceOf(CryptoError);

    await expect(
      decryptFileChunk(
        keyHandle,
        frames[0]!,
        shareId,
        headerHash,
        parsed.noncePrefix,
        0,
        true,
      ),
    ).rejects.toBeInstanceOf(CryptoError);
  });

  it("round-trips the encrypted manifest", async () => {
    const key = generateContentKey();
    const manifest: FileManifest = {
      v: 1,
      name: "报告.pdf",
      mime: "application/pdf",
      size: 1234,
      sha256: "a".repeat(64),
      chunkCount: 1,
      chunkSize: 1024,
    };
    const encrypted = await encryptManifest(key, manifest, shareId);
    expect(await decryptManifest(key, encrypted, shareId)).toEqual(manifest);

    const otherKey = generateContentKey();
    await expect(decryptManifest(otherKey, encrypted, shareId)).rejects.toBeInstanceOf(
      CryptoError,
    );
  });
});

describe("password envelope", () => {
  it("derives a verifier and unwraps the content key", async () => {
    const key = generateContentKey();
    const { envelope, authKey } = await createPasswordEnvelope(
      "correct horse battery staple",
      key,
      shareId,
    );
    expect(await sha256(authKey)).toEqual(
      Uint8Array.from(Buffer.from(envelope.verifier, "base64url")),
    );

    const unlocked = await unlockContentKey(
      "correct horse battery staple",
      envelope,
      shareId,
    );
    expect(unlocked.contentKey).toEqual(key);

    await expect(
      unlockContentKey("wrong password", envelope, shareId),
    ).rejects.toBeInstanceOf(CryptoError);
  });
});
