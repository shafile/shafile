import { createHash } from "node:crypto";
import { AppError, requireBearerToken } from "./http";
import { safeEqual, verifyAccessToken } from "./tokens";

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
