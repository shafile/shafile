"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Eye,
  EyeOff,
  FileUp,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Timer,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  CHUNK_SIZE,
  MAX_TEXT_BYTES,
  MAX_VIEWS,
  PASSWORD_MIN_LENGTH,
} from "@/lib/shared/limits";
import { ApiClientError } from "@/lib/shared/errors";
import { bytesToBase64Url } from "@/lib/shared/encoding";
import {
  buildFileHeader,
  createPasswordEnvelope,
  encodeContentKey,
  encryptText,
  generateContentKey,
  generateFileId,
  generateNoncePrefix,
  generateShareId,
  hashFileHeader,
  importContentKey,
  type PasswordEnvelope,
} from "@/lib/client/crypto";
import { encryptAndUploadFile } from "@/lib/client/upload";
import { createShare } from "@/lib/client/api";
import {
  clearTelegramSession,
  getTelegramSessionToken,
  haptic,
  setClosingConfirmation,
} from "@/lib/client/telegram";
import {
  addManagement,
  buildManagementUrl,
} from "@/lib/client/storage";
import type { ManagedShare, ShareKind } from "@/lib/shared/types";
import { formatBytes, formatDateTime } from "@/lib/client/format";
import { useLocale } from "next-intl";
import { CopyButton } from "@/components/ui/copy-button";
import { ErrorNotice } from "@/components/ui/error-notice";
import { Progress } from "@/components/ui/progress";
import { QrCode } from "@/components/ui/qr-code";
import { ShareButton } from "@/components/ui/share-button";

type AccessMode = "link" | "password";
type Mode = "text" | "file";
type Stage = "idle" | "encrypting" | "uploading" | "finalizing";

type ResultState = {
  id: string;
  link: string;
  manageLink: string;
  password: string | null;
  hasPassword: boolean;
  kind: ShareKind;
  maxViews: number | null;
  expiresAt: number | null;
};

type PendingUpload = {
  id: string;
  uploadToken: string;
  manageToken: string;
  file: File;
  contentKey: Uint8Array;
  contentKeyHandle: CryptoKey;
  noncePrefix: Uint8Array;
  headerHash: Uint8Array;
  startAt: number | null;
  expiresAt: number | null;
  maxViews: number | null;
  hasPassword: boolean;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalInput(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CreateForm({ maxFileBytes }: { maxFileBytes: number }) {
  const t = useTranslations("Create");
  const common = useTranslations("Common");
  const a11y = useTranslations("Accessibility");
  const locale = useLocale();

  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [access, setAccess] = useState<AccessMode>("link");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [startMode, setStartMode] = useState<"now" | "scheduled">("now");
  const [startAtValue, setStartAtValue] = useState(() =>
    toLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [expiryMode, setExpiryMode] = useState<
    "1h" | "24h" | "7d" | "30d" | "never" | "custom"
  >("7d");
  const [expiryValue, setExpiryValue] = useState(() =>
    toLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  );
  const [viewsMode, setViewsMode] = useState<
    "1" | "3" | "5" | "10" | "unlimited" | "custom"
  >("1");
  const [customViews, setCustomViews] = useState("3");

  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  const maxFileSize = formatBytes(maxFileBytes, locale);

  useEffect(() => {
    setClosingConfirmation(working);
    return () => setClosingConfirmation(false);
  }, [working]);

  function resetAll() {
    setMode("text");
    setText("");
    setFile(null);
    setAccess("link");
    setPassword("");
    setStartMode("now");
    setExpiryMode("7d");
    setViewsMode("1");
    setError(null);
    setPending(null);
    setResult(null);
    setWorking(false);
    setStage("idle");
    setProgress({ done: 0, total: 0 });
  }

  function acceptFile(next: File | null) {
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (next.size > maxFileBytes) {
      setError(new ApiClientError("FILE_TOO_LARGE"));
      return;
    }
    setFile(next);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  }

  function resolveSchedule(): {
    startAt: number | null;
    expiresAt: number | null;
    maxViews: number | null;
  } {
    const now = Date.now();
    let startAt: number | null = null;
    if (startMode === "scheduled") {
      startAt = parseLocalInput(startAtValue);
      if (!startAt || startAt <= now) {
        throw new ApiClientError("INVALID_SCHEDULE");
      }
    }
    const scheduleBase = startAt ?? now;

    let expiresAt: number | null = null;
    if (expiryMode === "1h") expiresAt = scheduleBase + 60 * 60 * 1000;
    else if (expiryMode === "24h") expiresAt = scheduleBase + 24 * 60 * 60 * 1000;
    else if (expiryMode === "7d") expiresAt = scheduleBase + 7 * 24 * 60 * 60 * 1000;
    else if (expiryMode === "30d") expiresAt = scheduleBase + 30 * 24 * 60 * 60 * 1000;
    else if (expiryMode === "custom") {
      expiresAt = parseLocalInput(expiryValue);
      if (!expiresAt || expiresAt <= Math.max(now, scheduleBase)) {
        throw new ApiClientError("INVALID_SCHEDULE");
      }
    }

    let maxViews: number | null = null;
    if (viewsMode !== "unlimited") {
      maxViews =
        viewsMode === "custom" ? Number.parseInt(customViews, 10) : Number(viewsMode);
      if (!Number.isInteger(maxViews) || maxViews < 1 || maxViews > MAX_VIEWS) {
        throw new ApiClientError("INVALID_REQUEST");
      }
    }

    return { startAt, expiresAt, maxViews };
  }

  async function makePassword(
    contentKey: Uint8Array,
    id: string,
  ): Promise<PasswordEnvelope | null> {
    if (access !== "password") return null;
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new ApiClientError("PASSWORD_TOO_SHORT");
    }
    const { envelope } = await createPasswordEnvelope(password, contentKey, id);
    return envelope;
  }

  function buildResult(
    id: string,
    manageToken: string,
    contentKey: Uint8Array | null,
    kind: ShareKind,
    hasPassword: boolean,
    maxViews: number | null,
    expiresAt: number | null,
    startAt: number | null,
  ): ResultState {
    const origin = window.location.origin;
    const link = hasPassword
      ? `${origin}/s/${id}`
      : `${origin}/s/${id}#k=${encodeContentKey(contentKey!)}`;
    const manageLink = buildManagementUrl(id, manageToken);
    const entry: ManagedShare = {
      id,
      kind,
      manageToken,
      link,
      status: startAt !== null && startAt > Date.now() ? "scheduled" : "ready",
      createdAt: Date.now(),
      startAt,
      expiresAt,
      maxViews,
      views: 0,
      hasPassword,
    };
    addManagement(entry);
    haptic("success");
    return {
      id,
      link,
      manageLink,
      password: hasPassword ? password : null,
      hasPassword,
      kind,
      maxViews,
      expiresAt,
    };
  }

  async function uploadPendingFile(draft: PendingUpload) {
    setWorking(true);
    setError(null);
    setStage("uploading");
    setProgress({ done: 0, total: 0 });
    try {
      await encryptAndUploadFile({
        id: draft.id,
        uploadToken: draft.uploadToken,
        file: draft.file,
        contentKey: draft.contentKey,
        contentKeyHandle: draft.contentKeyHandle,
        noncePrefix: draft.noncePrefix,
        headerHash: draft.headerHash,
        onProgress: (value) => setProgress(value),
      });
      setStage("finalizing");
      setResult(
        buildResult(
          draft.id,
          draft.manageToken,
          draft.hasPassword ? null : draft.contentKey,
          "file",
          draft.hasPassword,
          draft.maxViews,
          draft.expiresAt,
          draft.startAt,
        ),
      );
      setPending(null);
      setStage("idle");
    } catch (caught) {
      setError(caught);
      setStage("idle");
    } finally {
      setWorking(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    setError(null);

    if (mode === "text" && !text.trim()) {
      setError(new ApiClientError("EMPTY_TEXT"));
      return;
    }
    if (mode === "file" && !file) {
      setError(new ApiClientError("FILE_REQUIRED"));
      return;
    }
    if (mode === "text" && new TextEncoder().encode(text).length > MAX_TEXT_BYTES) {
      setError(new ApiClientError("TEXT_TOO_LARGE"));
      return;
    }

    let schedule: ReturnType<typeof resolveSchedule>;
    try {
      schedule = resolveSchedule();
    } catch (caught) {
      setError(caught);
      return;
    }

    setWorking(true);
    setStage("encrypting");
    const id = generateShareId();
    const contentKey = generateContentKey();

    try {
      const sessionPromise = getTelegramSessionToken();
      const passwordEnvelope = await makePassword(contentKey, id);

      if (mode === "text") {
        const ciphertext = await encryptText(contentKey, text, id);
        const response = await createShare(
          {
            kind: "text",
            id,
            ...schedule,
            password: passwordEnvelope,
            payload: bytesToBase64Url(ciphertext),
          },
          await sessionPromise,
        );
        setResult(
          buildResult(
            id,
            response.manageToken,
            access === "link" ? contentKey : null,
            "text",
            access === "password",
            schedule.maxViews,
            schedule.expiresAt,
            schedule.startAt,
          ),
        );
        setStage("idle");
        return;
      }

      if (!file) throw new ApiClientError("INVALID_REQUEST");
      const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      const noncePrefix = generateNoncePrefix();
      const fileId = generateFileId();
      const header = buildFileHeader(CHUNK_SIZE, noncePrefix, fileId);
      const headerHash = await hashFileHeader(header);
      const contentKeyHandle = await importContentKey(contentKey);

      const response = await createShare(
        {
          kind: "file",
          id,
          ...schedule,
          password: passwordEnvelope,
          chunkSize: CHUNK_SIZE,
          chunkCount,
          noncePrefix: bytesToBase64Url(noncePrefix),
          fileId: bytesToBase64Url(fileId),
        },
        await sessionPromise,
      );
      if (!response.uploadToken) throw new ApiClientError("UPLOAD_FAILED");

      const draft: PendingUpload = {
        id,
        uploadToken: response.uploadToken,
        manageToken: response.manageToken,
        file,
        contentKey,
        contentKeyHandle,
        noncePrefix,
        headerHash,
        startAt: schedule.startAt,
        expiresAt: schedule.expiresAt,
        maxViews: schedule.maxViews,
        hasPassword: access === "password",
      };
      setPending(draft);
      await uploadPendingFile(draft);
    } catch (caught) {
      if (
        caught instanceof ApiClientError &&
        (caught.code === "UNAUTHORIZED" ||
          caught.code === "TELEGRAM_AUTH_FAILED")
      ) {
        clearTelegramSession();
      }
      setError(caught);
      setStage("idle");
    } finally {
      setWorking(false);
    }
  }

  if (result) {
    const invite = result.password
      ? t("inviteWithPassword", {
          link: result.link,
          password: result.password,
        })
      : t("inviteWithoutPassword", { link: result.link });

    return (
      <div className="container-page max-w-4xl py-10 sm:py-14">
        <div className="fade-rise card overflow-hidden">
          <div className="border-b border-line bg-green-soft/60 px-5 py-6 sm:px-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green text-[#04291c]">
              <CheckCircle2 size={24} strokeWidth={2.6} />
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {t("resultTitle")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t("resultDesc")}</p>
          </div>

          <div className="grid items-start gap-6 p-5 sm:p-8 lg:grid-cols-[1.4fr_0.6fr]">
            <div className="space-y-5">
              <div>
                <div className="label">
                  <span>{t("linkLabel")}</span>
                  <span className="chip">
                    {result.hasPassword ? <KeyRound size={12} /> : <Link2 size={12} />}
                    {result.password ? t("accessPassword") : t("accessLink")}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <code
                    dir="ltr"
                    data-testid="share-link"
                    className="min-w-0 flex-1 break-all rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-xs leading-5"
                  >
                    {result.link}
                  </code>
                  <CopyButton value={result.link} label={t("linkLabel")} />
                </div>
              </div>

              {result.password && (
                <div>
                  <div className="label">
                    <span>{t("passwordLabelResult")}</span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <code
                      dir="ltr"
                      data-testid="share-password"
                      className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm"
                    >
                      {result.password}
                    </code>
                    <CopyButton value={result.password} label={t("passwordLabelResult")} />
                  </div>
                </div>
              )}

              <div>
                <div className="label">
                  <span>{t("manageLabel")}</span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <code
                    dir="ltr"
                    data-testid="manage-link"
                    className="min-w-0 flex-1 break-all rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-xs leading-5"
                  >
                    {result.manageLink}
                  </code>
                  <CopyButton value={result.manageLink} label={t("manageLabel")} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <CopyButton
                  value={invite}
                  label={t("copyInvite")}
                  displayLabel={t("copyInvite")}
                />
                <ShareButton
                  url={result.link}
                  title={t("resultTitle")}
                  startParam={result.hasPassword ? result.id : undefined}
                  className="btn btn-accent btn-sm"
                />
                <Link href={result.link} target="_blank" className="btn btn-secondary btn-sm">
                  {t("openShare")}
                  <ArrowRight size={15} className="directional-icon" />
                </Link>
              </div>

              <div className="space-y-2">
                <p className="notice notice-warn">
                  <AlertTriangle size={17} className="shrink-0" />
                  <span>
                    {result.password ? t("warningPassword") : t("warningLink")}
                  </span>
                </p>
                <p className="notice notice-info">
                  <ShieldCheck size={17} className="shrink-0" />
                  <span>{t("warningNoRecovery")}</span>
                </p>
                {result.maxViews === 1 && (
                  <p className="notice notice-warn">
                    <Timer size={17} className="shrink-0" />
                    <span>{t("warningBurn")}</span>
                  </p>
                )}
                <p className="text-xs leading-5 text-muted">{t("warningServer")}</p>
                <p className="text-xs leading-5 text-muted">{t("savedLocally")}</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 text-center">
              <span className="chip">
                <CalendarClock size={13} />
                {result.expiresAt
                  ? formatDateTime(result.expiresAt, locale)
                  : common("never")}
              </span>
              <QrCode value={result.link} />
              <p className="text-xs leading-5 text-muted">{t("qrHint")}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-8">
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
              <X size={15} />
              {t("createAnother")}
            </button>
            <Link href="/manage" className="btn btn-secondary btn-sm">
              {common("navManage")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page grid gap-6 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:py-14">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t("subtitle")}</p>

        <form onSubmit={handleSubmit} className="card mt-6 overflow-hidden">
          <div className="flex gap-2 border-b border-line px-4 pt-4 sm:px-6">
            <button
              type="button"
              className={`tab-button ${mode === "text" ? "is-active" : ""}`}
              onClick={() => setMode("text")}
              disabled={working}
            >
              {t("tabText")}
            </button>
            <button
              type="button"
              className={`tab-button ${mode === "file" ? "is-active" : ""}`}
              onClick={() => setMode("file")}
              disabled={working}
            >
              {t("tabFile")}
            </button>
          </div>

          <fieldset disabled={working} className="space-y-6 p-4 sm:p-6">
            {mode === "text" ? (
              <div>
                <label className="label" htmlFor="share-text">
                  {t("textLabel")}
                </label>
                <textarea
                  id="share-text"
                  className="field"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={t("textPlaceholder")}
                  maxLength={MAX_TEXT_BYTES}
                />
                <p className="field-hint">{t("textHint")}</p>
              </div>
            ) : (
              <div>
                <span className="label">{t("fileLabel")}</span>
                <div
                  className={`dropzone ${dragActive ? "is-dragging" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={onDrop}
                >
                  {file ? (
                    <>
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-soft text-green-strong">
                        <FileUp size={23} />
                      </span>
                      <p className="mt-1 max-w-full break-all text-sm font-bold">
                        {t("fileSelected", {
                          name: file.name,
                          size: formatBytes(file.size, locale),
                        })}
                      </p>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm mt-1"
                        onClick={() => inputRef.current?.click()}
                      >
                        {t("changeFile")}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                        <FileUp size={23} />
                      </span>
                      <p className="mt-1 text-sm font-bold">{t("dropTitle")}</p>
                      <p className="text-xs text-muted">{t("dropHint")}</p>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm mt-2"
                        onClick={() => inputRef.current?.click()}
                      >
                        {t("chooseFile")}
                      </button>
                      <p className="mt-1 text-[11px] text-muted">
                        {t("maxSize", { size: maxFileSize })}
                      </p>
                    </>
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  className="sr-only"
                  aria-label={a11y("fileInput")}
                  onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
                />
                {!file && (
                  <p className="field-hint">{t("maxSize", { size: maxFileSize })}</p>
                )}
              </div>
            )}

            <div className="border-t border-line pt-6">
              <h2 className="text-base font-bold tracking-tight">{t("settingsTitle")}</h2>

              <div className="mt-4">
                <span className="label">{t("accessTitle")}</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={access === "link"}
                    className={`choice-card text-start ${access === "link" ? "is-active" : ""}`}
                    onClick={() => setAccess("link")}
                  >
                    <Link2 size={18} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-bold">{t("accessLink")}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted">
                        {t("accessLinkHint")}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={access === "password"}
                    className={`choice-card text-start ${access === "password" ? "is-active" : ""}`}
                    onClick={() => setAccess("password")}
                  >
                    <KeyRound size={18} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-bold">{t("accessPassword")}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted">
                        {t("accessPasswordHint")}
                      </span>
                    </span>
                  </button>
                </div>
              </div>

              {access === "password" && (
                <div className="mt-4 max-w-md">
                  <label className="label" htmlFor="share-password">
                    {t("passwordLabel")}
                  </label>
                  <div className="relative">
                    <input
                      id="share-password"
                      dir="ltr"
                      type={showPassword ? "text" : "password"}
                      className="field pe-11"
                      value={password}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t("passwordPlaceholder")}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-muted"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={a11y("togglePassword")}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <p className="field-hint">{t("passwordHint")}</p>
                </div>
              )}

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="label">{t("startLabel")}</span>
                  <select
                    id="start-mode"
                    className="field"
                    aria-label={t("startLabel")}
                    value={startMode}
                    onChange={(event) =>
                      setStartMode(event.target.value as "now" | "scheduled")
                    }
                  >
                    <option value="now">{t("startNow")}</option>
                    <option value="scheduled">{t("startScheduled")}</option>
                  </select>
                  {startMode === "scheduled" && (
                    <>
                      <label className="mt-2 sr-only" htmlFor="start-at">
                        {t("startAt")}
                      </label>
                      <input
                        id="start-at"
                        type="datetime-local"
                        className="field mt-2"
                        value={startAtValue}
                        onChange={(event) => setStartAtValue(event.target.value)}
                      />
                    </>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="expiry-select">
                    {t("expiryLabel")}
                  </label>
                  <select
                    id="expiry-select"
                    className="field"
                    value={expiryMode}
                    onChange={(event) =>
                      setExpiryMode(event.target.value as typeof expiryMode)
                    }
                  >
                    <option value="1h">{t("expiry1h")}</option>
                    <option value="24h">{t("expiry24h")}</option>
                    <option value="7d">{t("expiry7d")}</option>
                    <option value="30d">{t("expiry30d")}</option>
                    <option value="never">{t("expiryNever")}</option>
                    <option value="custom">{t("expiryCustom")}</option>
                  </select>
                  {expiryMode === "custom" && (
                    <>
                      <label className="mt-2 sr-only" htmlFor="expires-at">
                        {t("expiresAt")}
                      </label>
                      <input
                        id="expires-at"
                        type="datetime-local"
                        className="field mt-2"
                        value={expiryValue}
                        onChange={(event) => setExpiryValue(event.target.value)}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 max-w-xs">
                <label className="label" htmlFor="views-select">
                  {t("viewsLabel")}
                </label>
                <select
                  id="views-select"
                  className="field"
                  value={viewsMode}
                  onChange={(event) =>
                    setViewsMode(event.target.value as typeof viewsMode)
                  }
                >
                  <option value="1">{t("viewsOne")}</option>
                  <option value="3">{t("viewsThree")}</option>
                  <option value="5">{t("viewsFive")}</option>
                  <option value="10">{t("viewsTen")}</option>
                  <option value="unlimited">{t("viewsUnlimited")}</option>
                  <option value="custom">{t("viewsCustom")}</option>
                </select>
                {viewsMode === "custom" && (
                  <>
                    <label className="mt-2 sr-only" htmlFor="custom-views">
                      {t("customViews")}
                    </label>
                    <input
                      id="custom-views"
                      type="number"
                      min={1}
                      max={MAX_VIEWS}
                      inputMode="numeric"
                      enterKeyHint="done"
                      className="field mt-2"
                      value={customViews}
                      onChange={(event) => setCustomViews(event.target.value)}
                    />
                  </>
                )}
              </div>
            </div>

            {error ? <ErrorNotice error={error} /> : null}

            {pending && error ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void uploadPendingFile(pending)}
              >
                {t("uploadRetry")}
              </button>
            ) : null}

            {working && (
              <div className="rounded-2xl border border-line bg-surface-2 p-4" aria-live="polite">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <LoaderCircle size={17} className="animate-spin" />
                  {stage === "encrypting"
                    ? t("encrypting")
                    : stage === "uploading"
                      ? t("uploading")
                      : stage === "finalizing"
                        ? t("finalizing")
                        : t("creating")}
                </div>
                {progress.total > 0 && (
                  <>
                    <Progress
                      value={(progress.done / progress.total) * 100}
                      className="mt-3"
                      label={a11y("progress")}
                    />
                    <p className="mt-2 text-xs text-muted">
                      {t("progress", {
                        done: progress.done,
                        total: progress.total,
                      })}
                    </p>
                  </>
                )}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-accent btn-lg w-full"
              disabled={working}
            >
              {working ? t("creating") : t("submit")}
              {!working && <LockKeyhole size={18} />}
            </button>
          </fieldset>
        </form>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <ShieldCheck size={20} />
          </span>
          <h2 className="mt-3 text-base font-bold">{t("securityTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{t("securityHint")}</p>
          <ul className="mt-4 space-y-3 text-sm leading-6">
            <li className="flex gap-2">
              <LockKeyhole size={16} className="mt-1 shrink-0 text-green-strong" />
              <span>{common("footerNote")}</span>
            </li>
            <li className="flex gap-2">
              <KeyRound size={16} className="mt-1 shrink-0 text-brand" />
              <span>{t("warningNoRecovery")}</span>
            </li>
            <li className="flex gap-2">
              <EyeOff size={16} className="mt-1 shrink-0 text-blue" />
              <span>{t("warningServer")}</span>
            </li>
          </ul>
        </div>
        <div className="card-soft p-5 text-sm leading-6 text-muted">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <Timer size={17} className="text-brand" />
            {t("scheduleTitle")}
          </div>
          <p className="mt-2">
            {t("warningBurn")} {t("warningPassword")}
          </p>
        </div>
      </aside>
    </div>
  );
}
