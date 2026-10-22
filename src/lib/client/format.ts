const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number, locale: string): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const maximumFractionDigits = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits,
  }).format(value);
  return `${formatted} ${BYTE_UNITS[unit]}`;
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDateTime(
  timestamp: number,
  locale: string,
  withSeconds = false,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: withSeconds ? "medium" : "short",
  }).format(new Date(timestamp));
}

export function formatDate(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

export function relativeTime(
  target: number,
  now: number,
  locale: string,
): string {
  const seconds = Math.max(0, Math.round((target - now) / 1000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [unit, size] of units) {
    if (seconds >= size || unit === "second") {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return formatter.format(0, "second");
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 160) || "download";
}
