import { z } from "zod";
import { createFileShare, createTextShare } from "@/lib/server/create";
import {
  AppError,
  apiJson,
  assertSameOrigin,
  readJsonLimited,
  routeError,
} from "@/lib/server/http";
import { consumeRateLimit, rateLimitKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kdfSchema = z.object({
  alg: z.literal("argon2id"),
  memorySize: z.number().int(),
  iterations: z.number().int(),
  parallelism: z.number().int(),
  hashLength: z.literal(32),
  version: z.literal(1),
});

const passwordSchema = z.object({
  salt: z.string().min(1).max(64),
  verifier: z.string().min(1).max(128),
  wrappedKey: z.string().min(1).max(128),
  wrapNonce: z.string().min(1).max(64),
  kdf: kdfSchema,
});

const baseSchema = z.object({
  id: z.string(),
  startAt: z.number().int().nullable(),
  expiresAt: z.number().int().nullable(),
  maxViews: z.number().int().nullable(),
  password: passwordSchema.nullable(),
});

const textSchema = baseSchema.extend({
  kind: z.literal("text"),
  payload: z.string().min(1).max(400_000),
});

const fileSchema = baseSchema.extend({
  kind: z.literal("file"),
  chunkSize: z.number().int(),
  chunkCount: z.number().int(),
  noncePrefix: z.string().min(1).max(32),
  fileId: z.string().min(1).max(64),
});

const createSchema = z.discriminatedUnion("kind", [textSchema, fileSchema]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = consumeRateLimit(
      rateLimitKey("create", request),
      20,
      60 * 60 * 1000,
    );
    if (!limit.allowed) throw new AppError("RATE_LIMITED", 429);

    const raw = await readJsonLimited(request, 1024 * 1024);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) throw new AppError("INVALID_REQUEST", 400);

    const input = parsed.data;
    if (input.kind === "text") {
      const { row, manageToken } = await createTextShare({
        id: input.id,
        startAt: input.startAt,
        expiresAt: input.expiresAt,
        maxViews: input.maxViews,
        password: input.password,
        payload: input.payload,
      });
      return apiJson({ id: row.id, kind: row.kind, manageToken }, 201);
    }

    const { row, manageToken, uploadToken } = createFileShare({
      id: input.id,
      startAt: input.startAt,
      expiresAt: input.expiresAt,
      maxViews: input.maxViews,
      password: input.password,
      chunkSize: input.chunkSize,
      chunkCount: input.chunkCount,
      noncePrefix: input.noncePrefix,
      fileId: input.fileId,
    });

    return apiJson(
      { id: row.id, kind: row.kind, manageToken, uploadToken },
      201,
    );
  } catch (error) {
    return routeError(error);
  }
}
