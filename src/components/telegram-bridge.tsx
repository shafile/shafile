"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  applyTelegramTheme,
  getTelegramWebApp,
  isTelegramLaunch,
  loadTelegramSdk,
} from "@/lib/client/telegram";

export function TelegramBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

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
