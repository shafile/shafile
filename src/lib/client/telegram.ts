import { exchangeTelegramSession, getTelegramAppLink } from "./api";

export type TelegramThemeParams = {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
};

type TelegramInset = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

type TelegramBackButton = {
  show: () => void;
  hide: () => void;
  onClick: (handler: () => void) => void;
  offClick?: (handler: () => void) => void;
};

type TelegramHapticFeedback = {
  impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred?: (type: "error" | "success" | "warning") => void;
  selectionChanged?: () => void;
};

export type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { start_param?: string; user?: { language_code?: string } };
  colorScheme?: "light" | "dark";
  themeParams?: TelegramThemeParams;
  platform?: string;
  version?: string;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
  BackButton?: TelegramBackButton;
  HapticFeedback?: TelegramHapticFeedback;
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string) => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export type TelegramTheme = {
  scheme: "light" | "dark";
  vars: Record<string, string>;
};

const SDK_URL = "https://telegram.org/js/telegram-web-app.js";
const TG_HASH_PATTERN =
  /(?:^|&)tgWebApp(?:Data|Version|Platform|ThemeParams|InitData|StartParam)=/;
const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-zA-Z]+)$/;

let sdkPromise: Promise<void> | null = null;

function color(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return COLOR_PATTERN.test(trimmed) ? trimmed : null;
}

function mix(colorValue: string, background: string, amount: number): string {
  return `color-mix(in srgb, ${colorValue} ${amount}%, ${background})`;
}

export function buildTelegramTheme(
  params: TelegramThemeParams | undefined,
  scheme: "light" | "dark" | undefined,
): TelegramTheme | null {
  if (!params) return null;
  const background = color(params.bg_color);
  const foreground = color(params.text_color);
  if (!background || !foreground) return null;

  const secondary = color(params.secondary_bg_color) ?? background;
  const surface = color(params.section_bg_color) ?? background;
  const muted = color(params.hint_color) ?? foreground;
  const link =
    color(params.link_color) ??
    color(params.accent_text_color) ??
    color(params.button_color) ??
    foreground;
  const button = color(params.button_color) ?? link;
  const buttonText = color(params.button_text_color) ?? foreground;
  const header = color(params.header_bg_color) ?? background;

  return {
    scheme: scheme === "dark" ? "dark" : "light",
    vars: {
      "--background": background,
      "--background-2": secondary,
      "--surface": surface,
      "--surface-2": secondary,
      "--foreground": foreground,
      "--muted": muted,
      "--line": mix(foreground, background, 16),
      "--brand": link,
      "--brand-hover": link,
      "--brand-solid": button,
      "--brand-solid-hover": button,
      "--brand-solid-ink": buttonText,
      "--brand-soft": mix(link, background, 14),
      "--accent": link,
      "--accent-hover": link,
      "--accent-ink": buttonText,
      "--blue": link,
      "--blue-soft": mix(link, background, 12),
      "--hero-1": header,
      "--hero-2": background,
      "--hero-3": background,
      "--hero-accent-text": buttonText,
    },
  };
}

export function isTelegramLaunch(): boolean {
  if (typeof window === "undefined") return false;
  if (window.Telegram?.WebApp?.initData) return true;
  if (
    new URLSearchParams(window.location.search).has("tgWebAppStartParam")
  ) {
    return true;
  }
  return TG_HASH_PATTERN.test(window.location.hash.replace(/^#/, ""));
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function loadTelegramSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Telegram?.WebApp) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const finish = (retry: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (retry) sdkPromise = null;
      resolve();
    };

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => finish(false);
    script.onerror = () => finish(true);
    timer = window.setTimeout(() => finish(false), 5000);
    document.head.appendChild(script);
  });

  return sdkPromise;
}

function insetValue(value: number | undefined): string {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${Math.max(0, Math.round(numeric))}px`;
}

export function applyTelegramTheme(twa: TelegramWebApp): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  root.dataset.tg = "1";
  if (twa.colorScheme === "dark" || twa.colorScheme === "light") {
    root.dataset.theme = twa.colorScheme;
  }

  const theme = buildTelegramTheme(twa.themeParams, twa.colorScheme);
  if (theme) {
    for (const [name, value] of Object.entries(theme.vars)) {
      root.style.setProperty(name, value);
    }
    try {
      twa.setHeaderColor?.(theme.vars["--hero-1"]);
      twa.setBackgroundColor?.(theme.vars["--background"]);
    } catch {
      void 0;
    }
  }

  const safe = twa.safeAreaInset;
  const content = twa.contentSafeAreaInset;
  root.style.setProperty(
    "--tg-safe-top",
    insetValue(Math.max(safe?.top ?? 0, content?.top ?? 0)),
  );
  root.style.setProperty(
    "--tg-safe-bottom",
    insetValue(Math.max(safe?.bottom ?? 0, content?.bottom ?? 0)),
  );
  root.style.setProperty(
    "--tg-safe-left",
    insetValue(Math.max(safe?.left ?? 0, content?.left ?? 0)),
  );
  root.style.setProperty(
    "--tg-safe-right",
    insetValue(Math.max(safe?.right ?? 0, content?.right ?? 0)),
  );
}

export function telegramShareUrl(url: string): string {
  const params = new URLSearchParams({ url });
  return `https://t.me/share/url?${params.toString()}`;
}

export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function openExternalLink(href: string): boolean {
  if (!isTelegramLaunch() || !isWebUrl(href)) return false;
  const twa = getTelegramWebApp();
  if (!twa?.openLink) return false;
  twa.openLink(href);
  return true;
}

export function setClosingConfirmation(enabled: boolean): void {
  const twa = getTelegramWebApp();
  if (!twa) return;
  if (enabled) {
    twa.enableClosingConfirmation?.();
  } else {
    twa.disableClosingConfirmation?.();
  }
}

export function canShareLink(): boolean {
  if (isTelegramLaunch()) return true;
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function shareLink(url: string, title: string): Promise<void> {
  if (isTelegramLaunch()) {
    await loadTelegramSdk();
    const twa = getTelegramWebApp();
    if (twa?.openTelegramLink) {
      twa.openTelegramLink(telegramShareUrl(url));
      return;
    }
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    await navigator.share({ title, url });
    return;
  }
  throw new Error("SHARE_UNAVAILABLE");
}

export function haptic(type: "success" | "error" | "warning" | "light"): void {
  const feedback = getTelegramWebApp()?.HapticFeedback;
  if (!feedback) return;
  if (type === "success" || type === "error" || type === "warning") {
    feedback.notificationOccurred?.(type);
  } else {
    feedback.impactOccurred?.(type);
  }
}

let sessionCache: { token: string; expiresAt: number } | null = null;
let sessionPending: Promise<string | null> | null = null;
let appLinkPromise: Promise<string | null> | null = null;

export function getTelegramAppShareUrl(): Promise<string | null> {
  if (!appLinkPromise) {
    appLinkPromise = (async () => {
      try {
        const response = await getTelegramAppLink();
        return response.url;
      } catch {
        appLinkPromise = null;
        return null;
      }
    })();
  }
  return appLinkPromise;
}

export function buildMiniAppShareUrl(
  baseUrl: string,
  shareId: string,
): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("startapp", shareId);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, ms);
    void promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export function clearTelegramSession(): void {
  sessionCache = null;
}

export async function getTelegramSessionToken(): Promise<string | null> {
  if (!isTelegramLaunch()) return null;
  if (sessionCache && sessionCache.expiresAt > Date.now() + 60_000) {
    return sessionCache.token;
  }
  if (sessionPending) return sessionPending;

  sessionPending = (async () => {
    await loadTelegramSdk();
    const initData = getTelegramWebApp()?.initData;
    if (!initData) return null;

    const response = await withTimeout(
      exchangeTelegramSession(initData),
      8000,
    );
    if (!response?.token) {
      sessionCache = null;
      return null;
    }

    const ttl =
      Number.isFinite(response.expiresIn) && response.expiresIn > 0
        ? response.expiresIn
        : 3600;
    sessionCache = {
      token: response.token,
      expiresAt: Date.now() + ttl * 1000,
    };
    return response.token;
  })();

  try {
    return await sessionPending;
  } finally {
    sessionPending = null;
  }
}
