import { createHash } from "node:crypto";
import { base64UrlToBytes } from "@/lib/shared/encoding";
import { AppError, requireBearerToken } from "./http";
import {
  safeEqual,
  verifyAccessToken,
  verifyTelegramSessionToken,
} from "./tokens";

export type TelegramSession = {
  uid: Uint8Array;
  exp: number;
};

export function getTelegramSession(request: Request): TelegramSession | null {
  if (!request.headers.get("authorization")) return null;
  const token = requireBearerToken(request);
  const payload = verifyTelegramSessionToken(token);
  if (!payload) return null;
  try {
    const uid = base64UrlToBytes(payload.uid);
    if (uid.length !== 32) return null;
    return { uid, exp: payload.exp };
  } catch {
    return null;
  }
}

export function optionalTelegramSession(
  request: Request,
): TelegramSession | null {
  if (!request.headers.get("authorization")) return null;
  const session = getTelegramSession(request);
  if (!session) throw new AppError("TELEGRAM_AUTH_FAILED", 401);
  return session;
}

export function requireTelegramSession(request: Request): TelegramSession {
  const session = getTelegramSession(request);
  if (session) return session;
  throw new AppError(
    request.headers.get("authorization") ? "TELEGRAM_AUTH_FAILED" : "UNAUTHORIZED",
    401,
  );
}

export function requireAccessToken(request: Request, shareId: string): void {
  const token = requireBearerToken(request);
  if (!verifyAccessToken(token, shareId)) {
    throw new AppError("ACCESS_TOKEN_INVALID", 401);
  }
}

export function verifyPasswordVerifier(
  authKey: Uint8Array,
  verifier: Uint8Array | null,
): boolean {
  if (!verifier) return true;
  if (authKey.length !== 32) return false;
  const digest = new Uint8Array(createHash("sha256").update(authKey).digest());
  return safeEqual(digest, verifier);
}
