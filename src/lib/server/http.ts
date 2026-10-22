import type { ErrorCode } from "@/lib/shared/errors";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly params?: Record<string, string | number>;

  constructor(
    code: ErrorCode,
    status = 400,
    params?: Record<string, string | number>,
  ) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.params = params;
  }
}

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export function apiJson(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...NO_STORE,
      ...extraHeaders,
    },
  });
}

export function apiError(
  code: ErrorCode,
  status = 400,
  params?: Record<string, string | number>,
): Response {
  return apiJson({ error: { code, ...(params ? { params } : {}) } }, status);
}

export function routeError(error: unknown): Response {
  if (error instanceof AppError) {
    return apiError(error.code, error.status, error.params);
  }
  console.error("[shafile] unhandled route error", error);
  return apiError("INTERNAL_ERROR", 500);
}

export async function readBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError("INVALID_REQUEST", 413);
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new AppError("INVALID_REQUEST", 413);
    }
    chunks.push(value);
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function readJsonLimited<T = unknown>(
  request: Request,
  maxBytes: number,
): Promise<T> {
  const body = await readBodyLimited(request, maxBytes);
  if (body.length === 0) throw new AppError("INVALID_REQUEST", 400);
  try {
    return JSON.parse(new TextDecoder().decode(body)) as T;
  } catch {
    throw new AppError("INVALID_REQUEST", 400);
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const host = request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol =
    process.env.TRUST_PROXY === "true" && forwardedProto
      ? forwardedProto.split(",")[0]!.trim()
      : new URL(request.url).protocol.replace(":", "");

  const expected = host
    ? `${protocol}://${host}`
    : new URL(request.url).origin;

  if (origin !== expected) {
    throw new AppError("UNAUTHORIZED", 403);
  }
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

export function requireBearerToken(request: Request): string {
  const token = getBearerToken(request);
  if (!token) throw new AppError("UNAUTHORIZED", 401);
  return token;
}

export function getClientAddress(request: Request): string {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
  }
  return "direct";
}
