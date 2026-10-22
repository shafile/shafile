export const errorCodes = [
  "SHARE_NOT_FOUND",
  "SHARE_EXPIRED",
  "SHARE_REVOKED",
  "SHARE_EXHAUSTED",
  "NOT_YET_ACTIVE",
  "INVALID_PASSWORD",
  "RATE_LIMITED",
  "ACCESS_TOKEN_INVALID",
  "UNAUTHORIZED",
  "KEY_MISSING",
  "CORRUPT_DATA",
  "NETWORK_ERROR",
  "UNSUPPORTED_BROWSER",
  "FILE_TOO_LARGE",
  "TEXT_TOO_LARGE",
  "STORAGE_FULL",
  "UPLOAD_INCOMPLETE",
  "UPLOAD_FAILED",
  "UPLOAD_TOKEN_INVALID",
  "SHARE_NOT_READY",
  "SHARE_ID_CONFLICT",
  "INVALID_REQUEST",
  "INVALID_SCHEDULE",
  "PASSWORD_TOO_SHORT",
  "EMPTY_TEXT",
  "FILE_REQUIRED",
  "INTERNAL_ERROR",
  "FILE_MISSING",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    params?: Record<string, string | number>;
  };
};

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly params?: Record<string, string | number>;

  constructor(
    code: ErrorCode,
    status = 0,
    params?: Record<string, string | number>,
  ) {
    super(code);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.params = params;
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" &&
    (errorCodes as readonly string[]).includes(value)
  );
}
