import {
  base64UrlToBytes,
  bytesToBase64Url,
  concatBytes,
  readU32be,
  u32be,
  utf8,
  fromUtf8,
} from "@/lib/shared/encoding";

const FILE_MAGIC = utf8("SHF1");
const TEXT_MAGIC = utf8("SHF1T");
const ZERO_SALT = new Uint8Array(32);
const GCM_TAG_BYTES = 16;
const NONCE_BYTES = 12;

export const FILE_HEADER_SIZE = 32;
export const FILE_ID_BYTES = 16;
export const NONCE_PREFIX_BYTES = 8;
export const CONTENT_KEY_BYTES = 32;

export const DEFAULT_KDF = {
  alg: "argon2id",
  memorySize: 65536,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
  version: 1,
} as const;

export type KdfParams = {
  alg: "argon2id";
  memorySize: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
  version: number;
};

export type PasswordUnwrapData = {
  salt: string;
  wrappedKey: string;
  wrapNonce: string;
  kdf: KdfParams;
};

export type PasswordEnvelope = PasswordUnwrapData & {
  verifier: string;
};

export type FileManifest = {
  v: 1;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  chunkCount: number;
  chunkSize: number;
};

export type FileHeader = {
  raw: Uint8Array;
  chunkSize: number;
  noncePrefix: Uint8Array;
  fileId: Uint8Array;
};

export class CryptoError extends Error {
  readonly code = "CORRUPT_DATA";

  constructor(message = "Encrypted data failed its integrity check") {
    super(message);
    this.name = "CryptoError";
  }
}

function subtle(): SubtleCrypto {
  return globalThis.crypto.subtle;
}

function src(data: Uint8Array): BufferSource {
  return data as unknown as BufferSource;
}

export function randomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function generateContentKey(): Uint8Array {
  return randomBytes(CONTENT_KEY_BYTES);
}

export function generateShareId(): string {
  return bytesToBase64Url(randomBytes(16));
}

export function generateFileId(): Uint8Array {
  return randomBytes(FILE_ID_BYTES);
}

export function generateNoncePrefix(): Uint8Array {
  return randomBytes(NONCE_PREFIX_BYTES);
}

export function encodeContentKey(key: Uint8Array): string {
  if (key.length !== CONTENT_KEY_BYTES) throw new Error("Invalid key length");
  return bytesToBase64Url(key);
}

export function decodeContentKey(value: string): Uint8Array {
  const key = base64UrlToBytes(value);
  if (key.length !== CONTENT_KEY_BYTES) throw new Error("Invalid key length");
  return key;
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("raw", src(raw), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest("SHA-256", src(data)));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  return toHex(await sha256(data));
}

async function deriveHkdf(
  master: Uint8Array,
  info: string,
  length = 32,
): Promise<Uint8Array> {
  const base = await subtle().importKey("raw", src(master), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await subtle().deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: src(ZERO_SALT),
      info: src(utf8(info)),
    },
    base,
    length * 8,
  );
  return new Uint8Array(bits);
}

export async function derivePasswordMaterial(
  password: string,
  salt: Uint8Array,
  kdf: KdfParams = DEFAULT_KDF,
): Promise<{ authKey: Uint8Array; wrapKey: CryptoKey }> {
  const { argon2id } = await import("hash-wasm");
  const master = await argon2id({
    password: utf8(password.normalize("NFKC")),
    salt,
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memorySize,
    hashLength: kdf.hashLength,
    outputType: "binary",
  });
  const authKey = await deriveHkdf(master, "shafile/v1/auth");
  const wrapBits = await deriveHkdf(master, "shafile/v1/wrap");
  const wrapKey = await importAesKey(wrapBits);
  master.fill(0);
  wrapBits.fill(0);
  return { authKey, wrapKey };
}

function wrapAad(shareId: string): Uint8Array {
  return utf8(`shafile/v1/wrap:${shareId}`);
}

export async function createPasswordEnvelope(
  password: string,
  contentKey: Uint8Array,
  shareId: string,
): Promise<{ envelope: PasswordEnvelope; authKey: Uint8Array }> {
  const salt = randomBytes(16);
  const { authKey, wrapKey } = await derivePasswordMaterial(
    password,
    salt,
    DEFAULT_KDF,
  );
  const nonce = randomBytes(NONCE_BYTES);
  const wrapped = await subtle().encrypt(
    { name: "AES-GCM", iv: src(nonce), additionalData: src(wrapAad(shareId)) },
    wrapKey,
    src(contentKey),
  );
  const verifier = await sha256(authKey);
  return {
    envelope: {
      salt: bytesToBase64Url(salt),
      verifier: bytesToBase64Url(verifier),
      wrappedKey: bytesToBase64Url(new Uint8Array(wrapped)),
      wrapNonce: bytesToBase64Url(nonce),
      kdf: { ...DEFAULT_KDF },
    },
    authKey,
  };
}

export async function unwrapContentKeyWithWrapKey(
  wrapKey: CryptoKey,
  envelope: PasswordUnwrapData,
  shareId: string,
): Promise<Uint8Array> {
  try {
    const raw = await subtle().decrypt(
      {
        name: "AES-GCM",
        iv: src(base64UrlToBytes(envelope.wrapNonce)),
        additionalData: src(wrapAad(shareId)),
      },
      wrapKey,
      src(base64UrlToBytes(envelope.wrappedKey)),
    );
    return new Uint8Array(raw);
  } catch {
    throw new CryptoError("Password could not unlock the content key");
  }
}

export async function unlockContentKey(
  password: string,
  envelope: PasswordUnwrapData,
  shareId: string,
): Promise<{ authKey: Uint8Array; contentKey: Uint8Array }> {
  const salt = base64UrlToBytes(envelope.salt);
  const { authKey, wrapKey } = await derivePasswordMaterial(
    password,
    salt,
    envelope.kdf,
  );
  const contentKey = await unwrapContentKeyWithWrapKey(wrapKey, envelope, shareId);
  return { authKey, contentKey };
}

function textAad(shareId: string): Uint8Array {
  return utf8(`shafile/v1/text:${shareId}`);
}

export async function encryptText(
  contentKey: Uint8Array,
  plaintext: string,
  shareId: string,
): Promise<Uint8Array> {
  const key = await importAesKey(contentKey);
  const nonce = randomBytes(NONCE_BYTES);
  const ciphertext = await subtle().encrypt(
    {
      name: "AES-GCM",
      iv: src(nonce),
      additionalData: src(textAad(shareId)),
    },
    key,
    src(utf8(plaintext)),
  );
  return concatBytes(TEXT_MAGIC, nonce, new Uint8Array(ciphertext));
}

export async function decryptText(
  contentKey: Uint8Array,
  payload: Uint8Array,
  shareId: string,
): Promise<string> {
  if (payload.length < TEXT_MAGIC.length + NONCE_BYTES + GCM_TAG_BYTES) {
    throw new CryptoError();
  }
  const magic = payload.slice(0, TEXT_MAGIC.length);
  if (fromUtf8(magic) !== "SHF1T") throw new CryptoError();
  const nonce = payload.slice(TEXT_MAGIC.length, TEXT_MAGIC.length + NONCE_BYTES);
  const ciphertext = payload.slice(TEXT_MAGIC.length + NONCE_BYTES);
  const key = await importAesKey(contentKey);
  try {
    const plaintext = await subtle().decrypt(
      {
        name: "AES-GCM",
        iv: src(nonce),
        additionalData: src(textAad(shareId)),
      },
      key,
      src(ciphertext),
    );
    return fromUtf8(new Uint8Array(plaintext));
  } catch {
    throw new CryptoError();
  }
}

export function buildFileHeader(
  chunkSize: number,
  noncePrefix: Uint8Array,
  fileId: Uint8Array,
): Uint8Array {
  if (noncePrefix.length !== NONCE_PREFIX_BYTES) {
    throw new Error("Invalid nonce prefix length");
  }
  if (fileId.length !== FILE_ID_BYTES) throw new Error("Invalid file id length");
  return concatBytes(FILE_MAGIC, u32be(chunkSize), noncePrefix, fileId);
}

export function parseFileHeader(header: Uint8Array): FileHeader {
  if (header.length !== FILE_HEADER_SIZE) throw new CryptoError();
  if (fromUtf8(header.slice(0, 4)) !== "SHF1") throw new CryptoError();
  const chunkSize = readU32be(header, 4);
  if (chunkSize < 1024 || chunkSize > 64 * 1024 * 1024) throw new CryptoError();
  return {
    raw: header,
    chunkSize,
    noncePrefix: header.slice(8, 16),
    fileId: header.slice(16, 32),
  };
}

export async function hashFileHeader(header: Uint8Array): Promise<Uint8Array> {
  return sha256(header);
}

function chunkAad(
  headerHash: Uint8Array,
  shareId: string,
  index: number,
  isFinal: boolean,
): Uint8Array {
  return concatBytes(
    headerHash,
    utf8(shareId),
    u32be(index),
    new Uint8Array([isFinal ? 1 : 0]),
  );
}

function chunkNonce(noncePrefix: Uint8Array, index: number): Uint8Array {
  return concatBytes(noncePrefix, u32be(index));
}

export async function encryptFileChunk(
  key: CryptoKey,
  plaintext: Uint8Array,
  shareId: string,
  headerHash: Uint8Array,
  noncePrefix: Uint8Array,
  index: number,
  isFinal: boolean,
): Promise<Uint8Array> {
  const ciphertext = await subtle().encrypt(
    {
      name: "AES-GCM",
      iv: src(chunkNonce(noncePrefix, index)),
      additionalData: src(chunkAad(headerHash, shareId, index, isFinal)),
    },
    key,
    src(plaintext),
  );
  const body = new Uint8Array(ciphertext);
  return concatBytes(u32be(body.length), body);
}

export async function decryptFileChunk(
  key: CryptoKey,
  frame: Uint8Array,
  shareId: string,
  headerHash: Uint8Array,
  noncePrefix: Uint8Array,
  index: number,
  isFinal: boolean,
): Promise<Uint8Array> {
  if (frame.length < 4 + GCM_TAG_BYTES) throw new CryptoError();
  const length = readU32be(frame, 0);
  if (length !== frame.length - 4) throw new CryptoError();
  const ciphertext = frame.slice(4);
  try {
    const plaintext = await subtle().decrypt(
      {
        name: "AES-GCM",
        iv: src(chunkNonce(noncePrefix, index)),
        additionalData: src(chunkAad(headerHash, shareId, index, isFinal)),
      },
      key,
      src(ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new CryptoError();
  }
}

export async function importContentKey(
  contentKey: Uint8Array,
): Promise<CryptoKey> {
  return importAesKey(contentKey);
}

function manifestAad(shareId: string): Uint8Array {
  return utf8(`shafile/v1/manifest:${shareId}`);
}

export async function encryptManifest(
  contentKey: Uint8Array,
  manifest: FileManifest,
  shareId: string,
): Promise<Uint8Array> {
  const key = await importAesKey(contentKey);
  const nonce = randomBytes(NONCE_BYTES);
  const ciphertext = await subtle().encrypt(
    {
      name: "AES-GCM",
      iv: src(nonce),
      additionalData: src(manifestAad(shareId)),
    },
    key,
    src(utf8(JSON.stringify(manifest))),
  );
  const body = concatBytes(nonce, new Uint8Array(ciphertext));
  return concatBytes(u32be(body.length), body);
}

export async function decryptManifest(
  contentKey: Uint8Array,
  frame: Uint8Array,
  shareId: string,
): Promise<FileManifest> {
  if (frame.length < 4 + NONCE_BYTES + GCM_TAG_BYTES) throw new CryptoError();
  const length = readU32be(frame, 0);
  if (length !== frame.length - 4) throw new CryptoError();
  const body = frame.slice(4);
  const nonce = body.slice(0, NONCE_BYTES);
  const ciphertext = body.slice(NONCE_BYTES);
  const key = await importAesKey(contentKey);
  try {
    const plaintext = await subtle().decrypt(
      {
        name: "AES-GCM",
        iv: src(nonce),
        additionalData: src(manifestAad(shareId)),
      },
      key,
      src(ciphertext),
    );
    const parsed = JSON.parse(fromUtf8(new Uint8Array(plaintext))) as FileManifest;
    if (
      parsed.v !== 1 ||
      typeof parsed.name !== "string" ||
      typeof parsed.mime !== "string" ||
      !Number.isInteger(parsed.size) ||
      typeof parsed.sha256 !== "string" ||
      !Number.isInteger(parsed.chunkCount)
    ) {
      throw new CryptoError();
    }
    return parsed;
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError();
  }
}

export async function createPlaintextHasher() {
  const { createSHA256 } = await import("hash-wasm");
  return createSHA256();
}

export async function verifyPlaintextHash(
  hasher: { digest: (format?: "hex") => string },
  expectedHex: string,
): Promise<boolean> {
  return hasher.digest("hex") === expectedHex;
}
