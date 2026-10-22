import { ApiClientError, type ErrorCode, isErrorCode } from "@/lib/shared/errors";
import { CryptoError } from "./crypto";

export function errorCodeOf(error: unknown): ErrorCode {
  if (error instanceof ApiClientError) return error.code;
  if (error instanceof CryptoError) return "CORRUPT_DATA";
  if (error instanceof DOMException && error.name === "AbortError") {
    return "NETWORK_ERROR";
  }
  return "NETWORK_ERROR";
}

export function isErrorCodeValue(value: string): value is ErrorCode {
  return isErrorCode(value);
}
