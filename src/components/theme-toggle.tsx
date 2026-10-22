"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { loadTheme, saveTheme } from "@/lib/client/storage";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const t = useTranslations("Common");
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = loadTheme();
    const current =
      stored ??
      (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    saveTheme(next);
  }

  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggle}
      aria-label={t("theme")}
      title={t("theme")}
    >
      {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
