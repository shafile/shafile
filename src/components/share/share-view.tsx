"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileKey2,
  FileText,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Timer,
  XCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ShareMeta } from "@/lib/shared/types";
import { base64UrlToBytes } from "@/lib/shared/encoding";
import {
  CryptoError,
  decodeContentKey,
  decryptManifest,
  decryptText,
  derivePasswordMaterial,
  unwrapContentKeyWithWrapKey,
  type FileManifest,
} from "@/lib/client/crypto";
import {
  getManifest,
  getShareMeta,
  getTextContent,
  requestAccess,
} from "@/lib/client/api";
import { downloadAndDecryptFile, downloadTextFile } from "@/lib/client/download";
import {
  formatBytes,
  formatDateTime,
  relativeTime,
} from "@/lib/client/format";
import { CopyButton } from "@/components/ui/copy-button";
import { ErrorNotice } from "@/components/ui/error-notice";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { haptic, setClosingConfirmation } from "@/lib/client/telegram";

const MarkdownView = dynamic(
  () => import("./markdown-view").then((module) => module.MarkdownView),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-24 animate-pulse rounded-xl bg-surface-2"
        aria-hidden="true"
      />
    ),
  },
);

type AccessState = { token: string; issuedAt: number };

function shareKeyFromHash(): Uint8Array | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const raw = params.get("k");
  if (!raw) return null;
  try {
    return decodeContentKey(raw);
  } catch {
    return null;
  }
}

function effectiveStatus(meta: ShareMeta, now: number) {
  if (meta.status === "revoked" || meta.status === "burned") return meta.status;
  if (meta.status === "expired") return "expired";
  if (meta.status === "draft") return "draft";
  if (meta.expiresAt !== null && now >= meta.expiresAt) return "expired";
  if (meta.maxViews !== null && meta.views >= meta.maxViews) return "exhausted";
  return meta.status;
}

export function ShareView({ id }: { id: string }) {
  const t = useTranslations("Share");
  const common = useTranslations("Common");
  const locale = useLocale();
  const a11y = useTranslations("Accessibility");

  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [linkKey, setLinkKey] = useState<Uint8Array | null>(null);
  const [keyWasMissing, setKeyWasMissing] = useState(false);

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<unknown>(null);
  const [authKey, setAuthKey] = useState<Uint8Array | null>(null);
  const [contentKey, setContentKey] = useState<Uint8Array | null>(null);
  const [access, setAccess] = useState<AccessState | null>(null);

  const [manifest, setManifest] = useState<FileManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState<unknown>(null);

  const [text, setText] = useState<string | null>(null);
  const [textError, setTextError] = useState<unknown>(null);
  const [viewingText, setViewingText] = useState(false);
  const [textMode, setTextMode] = useState<"rendered" | "raw">("rendered");

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const [downloadDone, setDownloadDone] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [keepContent, setKeepContent] = useState(false);

  const [tick, setTick] = useState(() => Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  const [clearedKey, setClearedKey] = useState(false);
  const [viaTelegram, setViaTelegram] = useState(false);

  const autoAccessRef = useRef(false);
  const autoRefreshRef = useRef(false);

  useEffect(() => {
    setViaTelegram(
      new URLSearchParams(window.location.search).get("via") === "tg",
    );
  }, []);

  useEffect(() => {
    const key = shareKeyFromHash();
    setLinkKey(key);
    setKeyWasMissing(key === null);
  }, []);

  const refreshMeta = useCallback(async () => {
    try {
      const next = await getShareMeta(id);
      setMeta(next);
      setServerOffset(next.serverNow - Date.now());
      return next;
    } catch (error) {
      setLoadError(error);
      return null;
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getShareMeta(id)
      .then((next) => {
        if (cancelled) return;
        setMeta(next);
        setServerOffset(next.serverNow - Date.now());
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setClosingConfirmation(downloading || viewingText || unlocking);
    return () => setClosingConfirmation(false);
  }, [downloading, viewingText, unlocking]);

  const loadManifest = useCallback(
    async (key: Uint8Array, token: string) => {
      setManifestLoading(true);
      setManifestError(null);
      try {
        const bytes = await getManifest(id, token);
        const decrypted = await decryptManifest(key, bytes, id);
        if (meta?.chunkCount != null && decrypted.chunkCount !== meta.chunkCount) {
          throw new CryptoError("Chunk count mismatch");
        }
        setManifest(decrypted);
      } catch (error) {
        setManifestError(error);
      } finally {
        setManifestLoading(false);
      }
    },
    [id, meta?.chunkCount],
  );

  useEffect(() => {
    if (
      !meta ||
      meta.status !== "ready" ||
      meta.hasPassword ||
      contentKey ||
      !linkKey ||
      autoAccessRef.current
    ) {
      return;
    }
    autoAccessRef.current = true;
    let cancelled = false;
    setUnlocking(true);
    setUnlockError(null);
    (async () => {
      try {
        const granted = await requestAccess(id);
        if (cancelled) return;
        setAccess({ token: granted.token, issuedAt: Date.now() });
        setContentKey(linkKey);
        setAuthKey(null);
        if (meta.kind === "file") await loadManifest(linkKey, granted.token);
      } catch (error) {
        if (!cancelled) {
          autoAccessRef.current = false;
          setUnlockError(error);
        }
      } finally {
        if (!cancelled) setUnlocking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meta, contentKey, linkKey, id, loadManifest]);

  useEffect(() => {
    if (
      !meta ||
      meta.status !== "scheduled" ||
      meta.startAt === null ||
      autoRefreshRef.current
    ) {
      return;
    }
    if (tick + serverOffset >= meta.startAt) {
      autoRefreshRef.current = true;
      void refreshMeta();
    }
  }, [meta, tick, serverOffset, refreshMeta]);

  async function unlockWithPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!meta?.password || unlocking) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const salt = base64UrlToBytes(meta.password.salt);
      const { authKey: nextAuthKey, wrapKey } = await derivePasswordMaterial(
        password,
        salt,
        meta.password.kdf,
      );
      const granted = await requestAccess(id, nextAuthKey);
      const key = await unwrapContentKeyWithWrapKey(
        wrapKey,
        meta.password,
        id,
      );
      setAuthKey(nextAuthKey);
      setContentKey(key);
      setAccess({ token: granted.token, issuedAt: Date.now() });
      setPassword("");
      haptic("success");
      if (meta.kind === "file") await loadManifest(key, granted.token);
    } catch (error) {
      haptic("error");
      setUnlockError(error);
    } finally {
      setUnlocking(false);
    }
  }

  const ensureAccess = useCallback(
    async (force = false): Promise<string> => {
      if (
        !force &&
        access &&
        Date.now() - access.issuedAt < 8 * 60 * 1000
      ) {
        return access.token;
      }
      const granted = await requestAccess(id, authKey ?? undefined);
      setAccess({ token: granted.token, issuedAt: Date.now() });
      return granted.token;
    },
    [access, authKey, id],
  );

  async function viewNote() {
    if (!contentKey || viewingText) return;
    setViewingText(true);
    setTextError(null);
    try {
      const token = await ensureAccess();
      const { bytes } = await getTextContent(id, token);
      const plaintext = await decryptText(contentKey, bytes, id);
      setText(plaintext);
      setKeepContent(true);
      haptic("success");
      await refreshMeta();
    } catch (error) {
      haptic("error");
      setTextError(error);
    } finally {
      setViewingText(false);
    }
  }

  async function downloadFile() {
    if (!meta || !contentKey || !manifest || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    setDownloadDone(false);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    try {
      const token = await ensureAccess();
      const result = await downloadAndDecryptFile({
        id,
        token,
        contentKey,
        meta,
        expectedManifest: manifest,
        onProgress: (done, total) => {
          setDownloadedBytes(done);
          setDownloadProgress(total > 0 ? (done / total) * 100 : 0);
        },
      });
      if (result.cancelled) return;
      setKeepContent(true);
      setDownloadDone(true);
      haptic("success");
      await refreshMeta();
    } catch (error) {
      haptic("error");
      setDownloadError(error);
    } finally {
      setDownloading(false);
    }
  }

  const now = tick + serverOffset;
  const status = meta ? effectiveStatus(meta, now) : null;
  const startsIn =
    meta?.startAt && meta.startAt > now
      ? relativeTime(meta.startAt, now, locale)
      : null;
  const expiresIn =
    meta?.expiresAt && meta.expiresAt > now
      ? relativeTime(meta.expiresAt, now, locale)
      : null;
  const remaining = useMemo(() => {
    if (!meta) return null;
    return meta.remainingViews;
  }, [meta]);

  function clearKeyFromAddress() {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setClearedKey(true);
  }

  if (loading) {
    return (
      <div className="container-page max-w-2xl py-16">
        <div className="card flex items-center justify-center gap-3 px-6 py-20 text-sm text-muted">
          <LoaderCircle size={18} className="animate-spin" />
          {t("loading")}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container-page max-w-2xl py-12">
        <div className="card p-6 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-soft text-red">
            <XCircle size={24} />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{t("notFoundTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{t("notFoundDesc")}</p>
          <div className="mt-4">
            <ErrorNotice error={loadError} />
          </div>
          <Link href="/" className="btn btn-secondary mt-5">
            {common("backHome")}
          </Link>
        </div>
      </div>
    );
  }

  if (!meta) return null;

  if (!keepContent && (status === "expired" || status === "revoked" || status === "exhausted" || status === "burned" || status === "draft")) {
    const content =
      status === "expired"
        ? { title: t("expiredTitle"), desc: t("expiredDesc") }
        : status === "revoked"
          ? { title: t("revokedTitle"), desc: t("revokedDesc") }
          : status === "burned"
            ? { title: t("burnedTitle"), desc: t("burnedDesc") }
            : status === "exhausted"
              ? { title: t("exhaustedTitle"), desc: t("exhaustedDesc") }
              : { title: t("notFoundTitle"), desc: t("notFoundDesc") };
    return (
      <div className="container-page max-w-2xl py-12">
        <div className="card p-6 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-soft text-red">
            <XCircle size={24} />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{content.title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{content.desc}</p>
          <Link href="/" className="btn btn-secondary mt-5">
            {common("backHome")}
          </Link>
        </div>
      </div>
    );
  }

  if (!keepContent && status === "scheduled") {
    return (
      <div className="container-page max-w-2xl py-12">
        <div className="card p-6 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-soft text-yellow">
            <CalendarClock size={24} />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{t("scheduledTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{t("scheduledDesc")}</p>
          {startsIn && (
            <p className="mt-5 inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-2 text-sm font-bold">
              <Clock3 size={16} className="text-brand" />
              {t("startsIn", { time: startsIn })}
            </p>
          )}
          <Link href="/" className="btn btn-secondary mt-6">
            {common("backHome")}
          </Link>
        </div>
      </div>
    );
  }

  if (!keepContent && keyWasMissing && !meta.hasPassword) {
    return (
      <div className="container-page max-w-2xl py-12">
        <div className="card p-6 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-soft text-yellow">
            <KeyRound size={24} />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{t("keyMissingTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {viaTelegram ? t("keyMissingTelegramDesc") : t("keyMissingDesc")}
          </p>
          <Link href="/" className="btn btn-secondary mt-5">
            {common("backHome")}
          </Link>
        </div>
      </div>
    );
  }

  if (!keepContent && meta.hasPassword && !contentKey) {
    return (
      <div className="container-page max-w-2xl py-12">
        <div className="card overflow-hidden">
          <div className="border-b border-line bg-brand-soft/60 px-6 py-7 sm:px-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-solid text-white">
              <LockKeyhole size={23} />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{t("passwordTitle")}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">{t("passwordDesc")}</p>
          </div>
          <form onSubmit={unlockWithPassword} className="space-y-4 p-6 sm:p-8">
            <div>
              <label className="label" htmlFor="unlock-password">
                {t("passwordPlaceholder")}
              </label>
              <div className="relative">
                <input
                  id="unlock-password"
                  dir="ltr"
                  type={showPassword ? "text" : "password"}
                  className="field pe-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  autoFocus
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
            </div>
            {unlockError ? <ErrorNotice error={unlockError} /> : null}
            <button type="submit" className="btn btn-primary w-full" disabled={unlocking || !password}>
              {unlocking ? (
                <>
                  <LoaderCircle size={17} className="animate-spin" />
                  {t("unlocking")}
                </>
              ) : (
                <>
                  <KeyRound size={17} />
                  {t("unlock")}
                </>
              )}
            </button>
            {expiresIn && <p className="text-center text-xs text-muted">{t("expiresIn", { time: expiresIn })}</p>}
          </form>
        </div>
      </div>
    );
  }

  if (!contentKey && !meta.hasPassword && linkKey) {
    if (unlockError) {
      return (
        <div className="container-page max-w-2xl py-12">
          <div className="card p-6 sm:p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-soft text-red">
              <XCircle size={24} />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">
              {t("notFoundTitle")}
            </h1>
            <div className="mt-4">
              <ErrorNotice error={unlockError} />
            </div>
            <button
              type="button"
              className="btn btn-secondary mt-5"
              onClick={() => window.location.reload()}
            >
              {common("retry")}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="container-page max-w-2xl py-16">
        <div className="card flex items-center justify-center gap-3 px-6 py-20 text-sm text-muted">
          <LoaderCircle size={18} className="animate-spin" />
          {t("loading")}
        </div>
      </div>
    );
  }

  if (!contentKey) {
    return (
      <div className="container-page max-w-2xl py-12">
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">{t("keyMissingTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{t("keyMissingDesc")}</p>
        </div>
      </div>
    );
  }

  const isFile = meta.kind === "file";
  const exhaustedNow =
    meta.maxViews !== null && meta.views >= meta.maxViews;

  return (
    <div className="container-page max-w-3xl py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="chip">
          <ShieldCheck size={14} className="text-green-strong" />
          {t("securityNote")}
        </span>
        {linkKey && !clearedKey && !meta.hasPassword && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={clearKeyFromAddress}
            title={t("clearKeyHint")}
          >
            <KeyRound size={14} />
            {t("clearKey")}
          </button>
        )}
      </div>
      {clearedKey && (
        <p className="notice notice-info mt-3" role="status">
          <CheckCircle2 size={16} className="shrink-0" />
          {t("clearedKey")}
        </p>
      )}

      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-line bg-surface-2/50 px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-green">
              <ShieldCheck size={13} />
              {t("encryptedInBrowser")}
            </span>
            {meta.maxViews === 1 && (
              <span className="badge badge-yellow">
                <Timer size={13} />
                {t("oneTime")}
              </span>
            )}
            {meta.hasPassword && (
              <span className="badge badge-blue">
                <KeyRound size={13} />
                {t("passwordProtected")}
              </span>
            )}
            {status && <StatusBadge status={status} />}
          </div>

          <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
                {isFile ? <FileKey2 size={22} className="text-brand" /> : <FileText size={22} className="text-brand" />}
                {isFile ? t("fileTitle") : t("textTitle")}
              </h1>
              <p className="mt-1 text-sm leading-6 text-muted">
                {isFile ? t("downloadHint") : t("textDesc")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="chip">
                <Eye size={13} />
                {remaining === null
                  ? t("remainingUnlimited")
                  : t("remainingViews", { count: remaining })}
              </span>
              {expiresIn ? (
                <span className="chip">
                  <Clock3 size={13} />
                  {t("expiresIn", { time: expiresIn })}
                </span>
              ) : (
                <span className="chip">{t("expiresNever")}</span>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          {isFile ? (
            manifestLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted">
                <LoaderCircle size={17} className="animate-spin" />
                {common("loading")}
              </div>
            ) : manifestError ? (
              <ErrorNotice error={manifestError} />
            ) : manifest ? (
              <div className="space-y-5">
                <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/60 p-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                    <FileKey2 size={22} />
                  </span>
                  <div className="min-w-0">
                    <p className="break-all text-base font-bold">{manifest.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {formatBytes(manifest.size, locale)}
                      {manifest.mime ? ` · ${manifest.mime}` : ""}
                    </p>
                    <p dir="ltr" className="mt-1 break-all font-mono text-[10px] text-muted">
                      SHA-256 {manifest.sha256.slice(0, 24)}…
                    </p>
                  </div>
                </div>

                {downloading && (
                  <div className="rounded-2xl border border-line bg-surface-2 p-4" aria-live="polite">
                    <div className="flex items-center justify-between gap-2 text-sm font-bold">
                      <span className="flex items-center gap-2">
                        <LoaderCircle size={16} className="animate-spin" />
                        {t("decrypting")}
                      </span>
                      <span className="text-xs text-muted">
                        {formatBytes(downloadedBytes, locale)} / {formatBytes(manifest.size, locale)}
                      </span>
                    </div>
                    <Progress value={downloadProgress} className="mt-3" label={t("downloading")} />
                  </div>
                )}

                {downloadDone && (
                  <p className="notice notice-info" role="status">
                    <CheckCircle2 size={17} className="shrink-0" />
                    <span>{t("downloadDone")}</span>
                  </p>
                )}
                {downloadError ? <ErrorNotice error={downloadError} /> : null}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    data-testid="download-file"
                    className="btn btn-accent btn-lg"
                    onClick={() => void downloadFile()}
                    disabled={downloading || exhaustedNow || status !== "ready"}
                  >
                    {downloading ? (
                      <LoaderCircle size={18} className="animate-spin" />
                    ) : (
                      <Download size={18} />
                    )}
                    {downloading ? t("downloading") : t("download")}
                  </button>
                  {meta.maxViews === 1 && !downloadedBytes && (
                    <p className="max-w-sm text-xs leading-5 text-muted">
                      {t("viewOnceWarning")}
                    </p>
                  )}
                </div>

                {exhaustedNow && (
                  <p className="notice notice-warn">
                    <AlertTriangle size={17} className="shrink-0" />
                    <span>{t("burnedDesc")}</span>
                  </p>
                )}
              </div>
            ) : null
          ) : text ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="badge badge-green">
                  <CheckCircle2 size={13} />
                  {t("viewed")}
                </span>
                <div className="flex flex-wrap gap-2">
                  <div className="segmented" role="tablist" aria-label={t("textTitle")}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={textMode === "rendered"}
                      className={textMode === "rendered" ? "is-active" : ""}
                      onClick={() => setTextMode("rendered")}
                    >
                      {t("rendered")}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={textMode === "raw"}
                      className={textMode === "raw" ? "is-active" : ""}
                      onClick={() => setTextMode("raw")}
                    >
                      {t("raw")}
                    </button>
                  </div>
                  <CopyButton value={text} label={t("copyText")} displayLabel={t("copyText")} />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => downloadTextFile(text)}
                  >
                    <Download size={14} />
                    {t("downloadMarkdown")}
                  </button>
                </div>
              </div>

              {textMode === "rendered" ? (
                <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
                  <MarkdownView source={text} />
                </div>
              ) : (
                <pre className="max-h-[70vh] overflow-auto rounded-2xl border border-line bg-surface-2 p-4 text-xs leading-6 whitespace-pre-wrap break-words">
                  {text}
                </pre>
              )}

              <p className="text-xs text-muted">{t("markdownHint")}</p>
              {exhaustedNow ? (
                <p className="notice notice-warn">
                  <AlertTriangle size={17} className="shrink-0" />
                  <span>{t("burnedDesc")}</span>
                </p>
              ) : remaining !== null && remaining > 0 ? (
                <p className="notice notice-info">
                  <Eye size={17} className="shrink-0" />
                  <span>{t("viewAgainHint")}</span>
                </p>
              ) : null}
              {textError ? <ErrorNotice error={textError} /> : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-line bg-surface-2/60 p-5">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <FileText size={18} className="text-brand" />
                  {t("textTitle")}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{t("textDesc")}</p>
              </div>
              {textError ? <ErrorNotice error={textError} /> : null}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  data-testid="view-text"
                  className="btn btn-accent btn-lg"
                  onClick={() => void viewNote()}
                  disabled={viewingText || exhaustedNow || status !== "ready"}
                >
                  {viewingText ? (
                    <LoaderCircle size={18} className="animate-spin" />
                  ) : (
                    <Eye size={18} />
                  )}
                  {viewingText ? t("decrypting") : t("viewText")}
                </button>
                {meta.maxViews === 1 && (
                  <p className="max-w-md text-xs leading-5 text-muted">
                    {t("viewOnceWarning")}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <LockKeyhole size={13} />
              {t("securityNote")}
            </span>
            <span>{t("localTime")}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2 text-xs text-muted sm:grid-cols-2">
        <p>{isFile ? t("downloadHint") : t("markdownHint")}</p>
        {meta.startAt && (
          <p className="sm:text-end">
            {t("startsAt", { date: formatDateTime(meta.startAt, locale) })}
          </p>
        )}
        {meta.expiresAt && (
          <p>{t("expiresAt", { date: formatDateTime(meta.expiresAt, locale) })}</p>
        )}
      </div>
    </div>
  );
}

