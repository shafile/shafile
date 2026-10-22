import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  fromUtf8,
  utf8,
} from "@/lib/shared/encoding";
import { getSecrets } from "./config";

export function createOpaqueToken(bytes = 32): string {
  return bytesToBase64Url(new Uint8Array(randomBytes(bytes)));
}

export function hashToken(token: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(token).digest());
}

export function verifyTokenHash(
  token: string,
  expected: Uint8Array | null,
): boolean {
  if (!expected) return false;
  return safeEqual(hashToken(token), expected);
}

export function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index]! ^ b[index]!;
  }
  return diff === 0;
}

type AccessPayload = {
  v: 1;
  sid: string;
  exp: number;
};

export function createAccessToken(shareId: string, now = Date.now()): string {
  const payload: AccessPayload = {
    v: 1,
    sid: shareId,
    exp: now + 10 * 60 * 1000,
  };
  const encoded = bytesToBase64Url(utf8(JSON.stringify(payload)));
  const signature = bytesToBase64Url(
    new Uint8Array(
      createHmac("sha256", getSecrets().ticketSecret).update(encoded).digest(),
    ),
  );
  return `${encoded}.${signature}`;
}

export function verifyAccessToken(token: string, shareId: string): boolean {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;

  const expected = new Uint8Array(
    createHmac("sha256", getSecrets().ticketSecret).update(encoded).digest(),
  );
  let actual: Uint8Array;
  try {
    actual = base64UrlToBytes(signature);
  } catch {
    return false;
  }
  if (!safeEqual(actual, expected)) return false;

  try {
    const payload = JSON.parse(
      fromUtf8(base64UrlToBytes(encoded)),
    ) as AccessPayload;
    return (
      payload.v === 1 &&
      payload.sid === shareId &&
      Number.isFinite(payload.exp) &&
      payload.exp > Date.now()
    );
  } catch {
    return false;
  }
}