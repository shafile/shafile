"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  isLocale,
  localeCookieName,
  localeMeta,
  locales,
} from "@/i18n/locales";
import { cn } from "@/lib/cn";

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("Accessibility");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function choose(next: string) {
    if (!isLocale(next) || next === locale) {
      setOpen(false);
      return;
    }
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${localeCookieName}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    document.documentElement.lang = localeMeta[next].htmlLang;
    document.documentElement.dir = localeMeta[next].dir;
    setOpen(false);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="icon-button wide"
        aria-label={t("languageMenu")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
      >
        <Languages size={18} />
        <span className="hidden sm:inline">{localeMeta[locale as keyof typeof localeMeta]?.label ?? locale}</span>
      </button>
      {open && (
        <div className="popover" role="menu">
          {locales.map((option) => (
            <button
              type="button"
              key={option}
              role="menuitemradio"
              aria-checked={locale === option}
              className={cn("popover-item", locale === option && "is-active")}
              onClick={() => choose(option)}
            >
              <span>{localeMeta[option].label}</span>
              {locale === option && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
