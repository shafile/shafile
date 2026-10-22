import type { ManagedShare } from "@/lib/shared/types";

const MANAGEMENT_KEY = "shafile.management.v1";
const DRAFT_KEY = "shafile.draft.v1";
const THEME_KEY = "shafile.theme";

export function loadManagement(): ManagedShare[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MANAGEMENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isManagedShare);
  } catch {
    return [];
  }
}

function isManagedShare(value: unknown): value is ManagedShare {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ManagedShare>;
  return (
    typeof entry.id === "string" &&
    typeof entry.manageToken === "string" &&
    typeof entry.link === "string" &&
    (entry.kind === "text" || entry.kind === "file") &&
    typeof entry.createdAt === "number"
  );
}

export function saveManagement(entries: ManagedShare[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MANAGEMENT_KEY, JSON.stringify(entries));
}

export function addManagement(entry: ManagedShare): void {
  const entries = loadManagement().filter((item) => item.id !== entry.id);
  saveManagement([entry, ...entries]);
}

export function removeManagement(id: string): void {
  saveManagement(loadManagement().filter((entry) => entry.id !== id));
}

export function clearManagement(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MANAGEMENT_KEY);
}

export function saveDraft<T>(value: T): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value));
}

export function loadDraft<T>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(DRAFT_KEY);
}

export function loadTheme(): "light" | "dark" | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : null;
}

export function saveTheme(theme: "light" | "dark"): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, theme);
}

export function buildManagementUrl(id: string, manageToken: string): string {
  const base = `${window.location.origin}/manage`;
  return `${base}#id=${encodeURIComponent(id)}&t=${encodeURIComponent(manageToken)}`;
}

export function parseManagementUrl(
  raw: string,
): { id: string; manageToken: string } | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    if (value.startsWith("#")) {
      const hash = new URLSearchParams(value.slice(1));
      const id = hash.get("id");
      const token = hash.get("t");
      return id && token ? { id, manageToken: token } : null;
    }
    const url = new URL(value, window.location.origin);
    if (!url.pathname.endsWith("/manage")) return null;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const id = hash.get("id");
    const token = hash.get("t");
    if (!id || !token) return null;
    return { id, manageToken: token };
  } catch {
    return null;
  }
}
