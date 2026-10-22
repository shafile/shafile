import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getSecrets } from "./config";

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(token).digest());
}

export function verifyTokenHash(
  token: string,
  expected: Uint8Array | null,
): boolean {
  if (!expected) return false;
  const actual = hashToken(token);
  return safeEqual(actual, expected);
}

export function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
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
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getSecrets().ticketSecret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyAccessToken(token: string, shareId: string): boolean {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;

  const expected = createHmac("sha256", getSecrets().ticketSecret)
    .update(encoded)
    .digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  if (!safeEqual(new Uint8Array(actual), new Uint8Array(expected))) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
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
