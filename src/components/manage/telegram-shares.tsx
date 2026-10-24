"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Link2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { LookupResult } from "@/lib/shared/types";
import { ApiClientError } from "@/lib/shared/errors";
import {
  adoptTelegramShares,
  listTelegramShares,
  revokeShare,
} from "@/lib/client/api";
import {
  clearTelegramSession,
  getTelegramSessionToken,
  isTelegramLaunch,
} from "@/lib/client/telegram";
import { formatDateTime, formatNumber } from "@/lib/client/format";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorNotice } from "@/components/ui/error-notice";
import { StatusBadge } from "@/components/ui/status-badge";

function handleAuthFailure(error: unknown): void {
  if (
    error instanceof ApiClientError &&
    (error.code === "UNAUTHORIZED" ||
      error.code === "TELEGRAM_AUTH_FAILED")
  ) {
    clearTelegramSession();
  }
}

export function TelegramShares({
  localShares,
  onCountChange,
}: {
  localShares: { id: string; manageToken: string }[];
  onCountChange?: (count: number) => void;
}) {
  const t = useTranslations("Manage");
  const createT = useTranslations("Create");
  const common = useTranslations("Common");
  const locale = useLocale();
  const [supported, setSupported] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [items, setItems] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<LookupResult | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);

  useEffect(() => {
    setSupported(isTelegramLaunch());
  }, []);

  const refresh = useCallback(async () => {
    const token = await getTelegramSessionToken();
    if (!token) {
      setHasSession(false);
      setItems([]);
      return;
    }
    setHasSession(true);
    const response = await listTelegramShares(token);
    setItems(response.items);
    setError(null);
  }, []);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch((caught) => {
        if (!cancelled) {
          handleAuthFailure(caught);
          setError(caught);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, supported]);

  const localIds = new Set(localShares.map((entry) => entry.id));
  const ownedIds = new Set(items.map((item) => item.id));
  const visible = items.filter((item) => !localIds.has(item.id));
  const unlinked = localShares.filter((entry) => !ownedIds.has(entry.id));

  useEffect(() => {
    onCountChange?.(visible.length);
  }, [onCountChange, visible.length]);

  if (!supported) return null;

  if (loading && items.length === 0) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-muted">
        <LoaderCircle size={17} className="animate-spin" />
        {common("loading")}
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="mt-6">
        <ErrorNotice error={error} />
      </div>
    );
  }

  if (!hasSession) return null;
  if (visible.length === 0 && unlinked.length === 0 && !message) return null;

  async function doRevoke(item: LookupResult) {
    setRevoking(item.id);
    setError(null);
    setMessage(null);
    try {
      const token = await getTelegramSessionToken();
      if (!token) throw new ApiClientError("UNAUTHORIZED");
      await revokeShare(item.id, null, token);
      setConfirm(null);
      await refresh();
    } catch (caught) {
      handleAuthFailure(caught);
      setError(caught);
    } finally {
      setRevoking(null);
    }
  }

  async function doAdopt() {
    setAdopting(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getTelegramSessionToken();
      if (!token) throw new ApiClientError("UNAUTHORIZED");
      let linked = 0;
      let skipped = 0;
      for (let index = 0; index < unlinked.length; index += 100) {
        const response = await adoptTelegramShares(
          unlinked.slice(index, index + 100).map((entry) => ({
            id: entry.id,
            manageToken: entry.manageToken,
          })),
          token,
        );
        linked += response.linked;
        skipped += response.skipped;
      }
      await refresh();
      setMessage(
        skipped > 0
          ? t("telegramAdoptPartial", { linked, skipped })
          : t("telegramAdoptSuccess", { count: linked }),
      );
    } catch (caught) {
      handleAuthFailure(caught);
      setError(caught);
    } finally {
      setAdopting(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
        <ShieldCheck size={20} className="text-brand" />
        {t("telegramTitle")}
      </h2>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
        {t("telegramDesc")}
      </p>

      {message ? (
        <p className="notice notice-info mt-4" role="status">
          <ShieldCheck size={17} className="shrink-0" />
          <span>{message}</span>
        </p>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorNotice error={error} />
        </div>
      ) : null}

      {unlinked.length > 0 ? (
        <div className="card-soft mt-4 p-4">
          <p className="text-sm font-bold">{t("telegramAdopt")}</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
            {t("telegramAdoptHint")}
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm mt-3"
            onClick={() => void doAdopt()}
            disabled={adopting}
          >
            {adopting ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <Link2 size={15} />
            )}
            {adopting ? common("loading") : t("telegramAdopt")}
          </button>
        </div>
      ) : null}

      {visible.length > 0 ? (
        <div className="mt-4 space-y-3">
          {visible.map((item) => (
            <article key={item.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.status} />
                    <span className="chip">
                      {item.kind === "text"
                        ? createT("tabText")
                        : createT("tabFile")}
                    </span>
                    {item.hasPassword && (
                      <span className="chip">
                        <KeyRound size={12} />
                        {t("passwordProtected")}
                      </span>
                    )}
                  </div>
                  <p
                    dir="ltr"
                    className="mt-2 break-all font-mono text-xs text-muted"
                  >
                    {item.id}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>
                      {t("createdAt", {
                        date: formatDateTime(item.createdAt, locale),
                      })}
                    </span>
                    <span>
                      {item.expiresAt
                        ? t("expiresAt", {
                            date: formatDateTime(item.expiresAt, locale),
                          })
                        : t("neverExpires")}
                    </span>
                    <span>
                      {item.maxViews === null
                        ? t("viewsUnlimited", {
                            views: formatNumber(item.views, locale),
                          })
                        : t("views", {
                            views: formatNumber(item.views, locale),
                            max: formatNumber(item.maxViews, locale),
                          })}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-yellow">
                    {t("linkMissingKey")}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setConfirm(item)}
                  disabled={
                    item.status === "revoked" || revoking === item.id
                  }
                >
                  {revoking === item.id ? t("revoking") : t("revoke")}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        title={t("revokeTitle")}
        description={t("revokeDesc")}
        confirmLabel={t("revokeConfirm")}
        busy={confirm !== null && revoking === confirm.id}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && void doRevoke(confirm)}
      />
    </section>
  );
}
