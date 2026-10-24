import {
  ApiClientError,
  type ApiErrorBody,
  type ErrorCode,
} from "@/lib/shared/errors";
import { bytesToBase64Url } from "@/lib/shared/encoding";
import type {
  CreateShareResponse,
  LookupResult,
  ShareMeta,
  TelegramAdoptResponse,
  TelegramAppLinkResponse,
  TelegramSessionResponse,
  TelegramSharesResponse,
  UploadStatusResponse,
} from "@/lib/shared/types";

async function errorFromResponse(response: Response): Promise<ApiClientError> {
  let code: ErrorCode = "INTERNAL_ERROR";
  let params: Record<string, string | number> | undefined;
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body.error?.code) {
      code = body.error.code;
      params = body.error.params;
    }
  } catch {
    // Keep the fallback code.
  }
  return new ApiClientError(code, response.status, params);
}

async function request(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, {
      cache: "no-store",
      ...init,
    });
  } catch {
    throw new ApiClientError("NETWORK_ERROR");
  }
  if (!response.ok) throw await errorFromResponse(response);
  return response;
}

async function requestJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await request(input, init);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiClientError("NETWORK_ERROR");
  }
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function createShare(
  body: unknown,
  sessionToken?: string | null,
): Promise<CreateShareResponse> {
  return requestJson<CreateShareResponse>("/api/shares", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(sessionToken),
    },
    body: JSON.stringify(body),
  });
}

export async function exchangeTelegramSession(
  initData: string,
): Promise<TelegramSessionResponse> {
  return requestJson<TelegramSessionResponse>("/api/telegram/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
}

export async function listTelegramShares(
  sessionToken: string,
): Promise<TelegramSharesResponse> {
  return requestJson<TelegramSharesResponse>("/api/telegram/shares", {
    headers: authHeaders(sessionToken),
  });
}

export async function getTelegramAppLink(): Promise<TelegramAppLinkResponse> {
  return requestJson<TelegramAppLinkResponse>("/api/telegram/app");
}

export async function adoptTelegramShares(
  items: { id: string; manageToken: string }[],
  sessionToken: string,
): Promise<TelegramAdoptResponse> {
  return requestJson<TelegramAdoptResponse>("/api/telegram/adopt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(sessionToken),
    },
    body: JSON.stringify({ items }),
  });
}

export async function getShareMeta(id: string): Promise<ShareMeta> {
  return requestJson<ShareMeta>(`/api/shares/${encodeURIComponent(id)}`);
}

export async function requestAccess(
  id: string,
  authKey?: Uint8Array,
): Promise<{ token: string; expiresIn: number; serverNow: number }> {
  return requestJson(`/api/shares/${encodeURIComponent(id)}/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(authKey
        ? { authKey: bytesToBase64Url(authKey) }
        : {}),
    }),
  });
}

export async function getManifest(
  id: string,
  token: string,
): Promise<Uint8Array> {
  const response = await request(`/api/shares/${encodeURIComponent(id)}/manifest`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return new Uint8Array(await response.arrayBuffer());
}

export async function getTextContent(
  id: string,
  token: string,
): Promise<{ bytes: Uint8Array; remainingViews: string | null }> {
  const response = await request(`/api/shares/${encodeURIComponent(id)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    remainingViews: response.headers.get("x-remaining-views"),
  };
}

export async function getDownloadResponse(
  id: string,
  token: string,
  signal?: AbortSignal,
): Promise<Response> {
  return request(`/api/shares/${encodeURIComponent(id)}/download`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
}

export async function uploadPart(
  id: string,
  token: string,
  index: number,
  body: Uint8Array,
): Promise<void> {
  await request(
    `/api/uploads/${encodeURIComponent(id)}/parts/${index}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: body as unknown as BodyInit,
    },
  );
}

export async function getUploadStatus(
  id: string,
  token: string,
): Promise<UploadStatusResponse> {
  return requestJson(`/api/uploads/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function finalizeUpload(
  id: string,
  token: string,
  manifest: Uint8Array,
): Promise<void> {
  await request(`/api/uploads/${encodeURIComponent(id)}/finalize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      manifest: bytesToBase64Url(manifest),
    }),
  });
}

export async function lookupShares(
  items: { id: string; manageToken: string }[],
): Promise<{ items: LookupResult[]; serverNow: number }> {
  return requestJson("/api/shares/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

export async function revokeShare(
  id: string,
  manageToken?: string | null,
  sessionToken?: string | null,
): Promise<void> {
  await request(`/api/shares/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(sessionToken),
    },
    body: JSON.stringify(manageToken ? { manageToken } : {}),
  });
}
