"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { localeCookieName, localeMeta } from "@/i18n/locales";
import {
  applyTelegramTheme,
  getTelegramWebApp,
  isTelegramLaunch,
  loadTelegramSdk,
  telegramLocale,
} from "@/lib/client/telegram";

export function TelegramBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const localeTried = useRef(false);

  useEffect(() => {
    if (!isTelegramLaunch()) return;
    let cancelled = false;

    const refreshTheme = () => {
      const twa = getTelegramWebApp();
      if (twa) applyTelegramTheme(twa);
    };

    void loadTelegramSdk().then(() => {
      if (cancelled) return;
      const twa = getTelegramWebApp();
      if (!twa) return;

      twa.ready?.();
      twa.expand?.();
      applyTelegramTheme(twa);
      document.documentElement.dataset.tgReady = "1";

      twa.onEvent?.("themeChanged", refreshTheme);
      twa.onEvent?.("viewportChanged", refreshTheme);
      twa.onEvent?.("safeAreaChanged", refreshTheme);
      twa.onEvent?.("contentSafeAreaChanged", refreshTheme);

      setReady(true);
    });

    return () => {
      cancelled = true;
      const twa = getTelegramWebApp();
      twa?.offEvent?.("themeChanged", refreshTheme);
      twa?.offEvent?.("viewportChanged", refreshTheme);
      twa?.offEvent?.("safeAreaChanged", refreshTheme);
      twa?.offEvent?.("contentSafeAreaChanged", refreshTheme);
    };
  }, []);

  useEffect(() => {
    if (!ready || pathname !== "/" || localeTried.current) return;
    localeTried.current = true;

    const hasLocaleCookie = document.cookie
      .split("; ")
      .some((entry) => entry.startsWith(`${localeCookieName}=`));
    if (hasLocaleCookie) return;

    const next = telegramLocale();
    if (!next) return;
    if (document.documentElement.lang === localeMeta[next].htmlLang) return;

    try {
      const key = "shafile.tg-locale";
      if (window.sessionStorage.getItem(key) === next) return;
      window.sessionStorage.setItem(key, next);
    } catch {
      return;
    }

    const secure = window.location.protocol === "https:";
    const sameSite = window.self !== window.top && secure ? "None" : "Lax";
    document.documentElement.lang = localeMeta[next].htmlLang;
    document.documentElement.dir = localeMeta[next].dir;
    document.cookie = `${localeCookieName}=${next}; Path=/; Max-Age=31536000; SameSite=${sameSite}${secure ? "; Secure" : ""}`;
    router.refresh();
  }, [ready, pathname, router]);

  useEffect(() => {
    if (!ready) return;
    const back = getTelegramWebApp()?.BackButton;
    if (!back) return;

    if (pathname === "/") {
      back.hide();
      return;
    }

    const goBack = () => router.back();
    back.onClick(goBack);
    back.show();

    return () => {
      back.offClick?.(goBack);
      back.hide();
    };
  }, [ready, pathname, router]);

  return null;
}
