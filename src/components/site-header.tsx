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
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <nav className="nav-pill" aria-label={t("appName")}>
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

          <Link href="/" className="brand" aria-label={t("appName")}>
            <span className="brand-mark" aria-hidden="true">
              <LockKeyhole size={17} strokeWidth={2.4} />
            </span>
            <span className="brand-word hidden sm:inline">{t("appName")}</span>
          </Link>
        </div>

        <div className="flex items-center gap-1.5">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
