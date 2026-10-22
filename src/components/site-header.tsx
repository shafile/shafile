"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/cn";

export function SiteHeader() {
  const t = useTranslations("Common");
  const pathname = usePathname();

  const links = [
    { href: "/create", label: t("navCreate") },
    { href: "/manage", label: t("navManage") },
  ];

  return (
    <header className="site-header">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <Link href="/" className="brand" aria-label={t("appName")}>
          <span className="brand-mark" aria-hidden="true">
            <LockKeyhole size={18} strokeWidth={2.4} />
          </span>
          <span className="brand-word hidden min-[380px]:inline">{t("appName")}</span>
          <span className="brand-tag hidden lg:inline">{t("tagline")}</span>
        </Link>

        <nav className="flex items-center gap-1" aria-label={t("appName")}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "nav-link",
                pathname === link.href || pathname.startsWith(`${link.href}/`)
                  ? "is-active"
                  : "",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
