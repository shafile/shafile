"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  ExternalLink,
  KeyRound,
  Keyboard,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { LookupResult, ManagedShare } from "@/lib/shared/types";
import { lookupShares, revokeShare } from "@/lib/client/api";
import {
  addManagement,
  clearManagement,
  loadManagement,
  parseManagementUrl,
  removeManagement,
} from "@/lib/client/storage";
import { formatDateTime, formatNumber } from "@/lib/client/format";
import { CopyButton } from "@/components/ui/copy-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorNotice } from "@/components/ui/error-notice";
import { ShareButton } from "@/components/ui/share-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { TelegramShares } from "./telegram-shares";

type Entry = ManagedShare;

export function ManageList() {
  const t = useTranslations("Manage");
  const common = useTranslations("Common");
  const createT = useTranslations("Create");
  const locale = useLocale();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [statuses, setStatuses] = useState<Record<string, LookupResult>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importValue, setImportValue] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<Entry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [remoteCount, setRemoteCount] = useState(0);
  const importedRef = useRef(false);

  const refresh = useCallback(
    async (list: Entry[], announce = false) => {
      if (list.length === 0) {
        setStatuses({});
        return;
      }
      if (announce) setRefreshing(true);
      try {
        const response = await lookupShares(
          list.map((entry) => ({ id: entry.id, manageToken: entry.manageToken })),
        );
        const next: Record<string, LookupResult> = {};
        for (const item of response.items) next[item.id] = item;
        setStatuses(next);
        setError(null);
      } catch (caught) {
        setError(caught);
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let list = loadManagement();
      const parsed = parseManagementUrl(window.location.hash);
      if (parsed && !importedRef.current) {
        importedRef.current = true;
        try {
          const response = await lookupShares([parsed]);
          const found = response.items[0];
          if (!found) {
            setMessage(t("importInvalid"));
          } else {
            const link = found.hasPassword
              ? `${window.location.origin}/s/${found.id}`
              : "";
            const entry: Entry = {
              ...found,
              manageToken: parsed.manageToken,
              link,
            };
            addManagement(entry);
            list = loadManagement();
            setMessage(t("importSuccess"));
          }
        } catch (caught) {
          setError(caught);
        }
        window.history.replaceState(null, "", window.location.pathname);
      }
      if (cancelled) return;
      setEntries(list);
      await refresh(list);
      if (!cancelled) setLoading(false);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [refresh, t]);

  async function importFromInput() {
    setMessage(null);
    setError(null);
    const parsed = parseManagementUrl(importValue);
    if (!parsed) {
      setMessage(t("importInvalid"));
      return;
    }
    setRefreshing(true);
    try {
      const response = await lookupShares([parsed]);
      const found = response.items[0];
      if (!found) {
        setMessage(t("importInvalid"));
        return;
      }
      const link = found.hasPassword
        ? `${window.location.origin}/s/${found.id}`
        : "";
      addManagement({ ...found, manageToken: parsed.manageToken, link });
      const list = loadManagement();
      setEntries(list);
      setImportValue("");
      setMessage(t("importSuccess"));
      await refresh(list);
    } catch (caught) {
      setError(caught);
    } finally {
      setRefreshing(false);
    }
  }

  async function doRevoke(entry: Entry) {
    setRevoking(entry.id);
    setError(null);
    try {
      await revokeShare(entry.id, entry.manageToken);
      setStatuses((current) => ({
        ...current,
        [entry.id]: {
          ...(current[entry.id] ?? {
            id: entry.id,
            kind: entry.kind,
            createdAt: entry.createdAt,
            startAt: entry.startAt,
            expiresAt: entry.expiresAt,
            maxViews: entry.maxViews,
            views: entry.views,
            hasPassword: entry.hasPassword,
          }),
          status: "revoked",
        },
      }));
      setConfirmRevoke(null);
      await refresh(loadManagement());
    } catch (caught) {
      setError(caught);
    } finally {
      setRevoking(null);
    }
  }

  function removeEntry(entry: Entry) {
    removeManagement(entry.id);
    const list = loadManagement();
    setEntries(list);
    setStatuses((current) => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });
  }

  function doClear() {
    clearManagement();
    setEntries([]);
    setStatuses({});
    setConfirmClear(false);
  }

  const parent = (
    <div className="container-page py-10 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void refresh(entries, true)}
            disabled={refreshing || entries.length === 0}
          >
            <LoaderCircle size={15} className={refreshing ? "animate-spin" : ""} />
            {t("refresh")}
          </button>
          <Link href="/create" className="btn btn-accent btn-sm">
            <Plus size={15} />
            {t("create")}
          </Link>
        </div>
      </div>

      {error ? <div className="mt-4"><ErrorNotice error={error} /></div> : null}
      {message && (
        <p className="notice notice-info mt-4" role="status">
          <ShieldCheck size={17} className="shrink-0" />
          <span>{message}</span>
        </p>
      )}

      <div className="card mt-6 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Keyboard size={17} className="text-brand" />
          {t("importTitle")}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted">{t("importDesc")}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            dir="ltr"
            className="field flex-1 font-mono text-xs"
            value={importValue}
            onChange={(event) => setImportValue(event.target.value)}
            placeholder={t("importPlaceholder")}
            aria-label={t("importTitle")}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void importFromInput()}
            disabled={refreshing || !importValue.trim()}
          >
            {t("importButton")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-muted">
          <LoaderCircle size={18} className="animate-spin" />
          {common("loading")}
        </div>
      ) : entries.length === 0 ? (
        remoteCount === 0 ? (
          <div className="card mt-8 flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <ShieldCheck size={30} />
            </span>
            <h2 className="mt-5 text-xl font-bold">{t("emptyTitle")}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">{t("emptyDesc")}</p>
            <Link href="/create" className="btn btn-accent mt-5">
              <Plus size={16} />
              {t("create")}
            </Link>
          </div>
        ) : null
      ) : (
        <div className="mt-8 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span className="chip">
              <ShieldCheck size={13} />
              {t("localOnly")}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 size={14} />
              {t("clearAll")}
            </button>
          </div>

          {[...entries]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((entry) => {
              const status = statuses[entry.id] ?? entry;
              return (
                <article key={entry.id} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={status.status} />
                        <span className="chip">
                          {entry.kind === "text" ? createT("tabText") : createT("tabFile")}
                        </span>
                        {entry.hasPassword && (
                          <span className="chip">
                            <KeyRound size={12} />
                            {t("passwordProtected")}
                          </span>
                        )}
                      </div>
                      <p dir="ltr" className="mt-2 break-all font-mono text-xs text-muted">
                        {entry.id}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        <span>{t("createdAt", { date: formatDateTime(entry.createdAt, locale) })}</span>
                        <span>
                          {entry.expiresAt
                            ? t("expiresAt", { date: formatDateTime(entry.expiresAt, locale) })
                            : t("neverExpires")}
                        </span>
                        <span>
                          {status.maxViews === null
                            ? t("viewsUnlimited", {
                                views: formatNumber(status.views, locale),
                              })
                            : t("views", {
                                views: formatNumber(status.views, locale),
                                max: formatNumber(status.maxViews, locale),
                              })}
                        </span>
                        {status.status === "scheduled" && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock size={13} />
                            {formatDateTime(status.startAt ?? entry.startAt ?? 0, locale)}
                          </span>
                        )}
                      </div>
                      {!entry.link && (
                        <p className="mt-2 text-xs text-yellow">
                          {t("linkMissingKey")}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {entry.link && (
                        <>
                          <ShareButton
                            url={entry.link}
                            title={t("title")}
                            startParam={entry.hasPassword ? entry.id : undefined}
                          />
                          <CopyButton value={entry.link} label={t("copyLink")} displayLabel={t("copyLink")} />
                          <Link
                            href={entry.link}
                            target="_blank"
                            className="btn btn-secondary btn-sm"
                          >
                            {t("open")}
                            <ExternalLink size={14} />
                          </Link>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setConfirmRevoke(entry)}
                        disabled={status.status === "revoked" || revoking === entry.id}
                      >
                        {revoking === entry.id ? t("revoking") : t("revoke")}
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("remove")}
                        title={t("remove")}
                        onClick={() => removeEntry(entry)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          <p className="px-1 text-xs text-muted">{t("keyWarning")}</p>
        </div>
      )}

      <TelegramShares
        localShares={entries.map((entry) => ({
          id: entry.id,
          manageToken: entry.manageToken,
        }))}
        onCountChange={setRemoteCount}
      />

      <ConfirmDialog
        open={confirmRevoke !== null}
        title={t("revokeTitle")}
        description={t("revokeDesc")}
        confirmLabel={t("revokeConfirm")}
        busy={confirmRevoke !== null && revoking === confirmRevoke.id}
        onClose={() => setConfirmRevoke(null)}
        onConfirm={() => confirmRevoke && void doRevoke(confirmRevoke)}
      />
      <ConfirmDialog
        open={confirmClear}
        title={t("clearTitle")}
        description={t("clearDesc")}
        confirmLabel={t("clearConfirm")}
        onClose={() => setConfirmClear(false)}
        onConfirm={doClear}
      />
    </div>
  );

  return parent;
}
