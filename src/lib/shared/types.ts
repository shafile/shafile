import type { KdfParams } from "@/lib/client/crypto";

export type ShareKind = "text" | "file";

export type ShareStatusView =
  | "ready"
  | "draft"
  | "scheduled"
  | "expired"
  | "revoked"
  | "exhausted"
  | "burned";

export type PasswordMeta = {
  salt: string;
  wrappedKey: string;
  wrapNonce: string;
  kdf: KdfParams;
};

export type ShareMeta = {
  id: string;
  kind: ShareKind;
  status: ShareStatusView;
  createdAt: number;
  startAt: number | null;
  expiresAt: number | null;
  maxViews: number | null;
  views: number;
  remainingViews: number | null;
  hasPassword: boolean;
  password: PasswordMeta | null;
  chunkSize: number | null;
  chunkCount: number | null;
  serverNow: number;
};

export type CreateShareResponse = {
  id: string;
  kind: ShareKind;
  manageToken: string;
  uploadToken?: string;
};

export type UploadStatusResponse = {
  uploaded: number[];
  chunkCount: number;
  ready: boolean;
};

export type LookupItem = {
  id: string;
  manageToken: string;
};

export type LookupResult = {
  id: string;
  kind: ShareKind;
  status: ShareStatusView;
  createdAt: number;
  startAt: number | null;
  expiresAt: number | null;
  maxViews: number | null;
  views: number;
  hasPassword: boolean;
};

export type ManagedShare = LookupResult & {
  manageToken: string;
  link: string;
  password?: string;
};

export type TelegramSessionResponse = {
  token: string;
  expiresIn: number;
};

export type TelegramSharesResponse = {
  items: LookupResult[];
  serverNow: number;
};

export type TelegramAdoptResponse = {
  linked: number;
  skipped: number;
};

export type TelegramAppLinkResponse = {
  url: string | null;
  botUsername: string | null;
  shortName: string;
};
