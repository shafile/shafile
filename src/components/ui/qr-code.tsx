"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

export function QrCode({ value }: { value: string }) {
  const t = useTranslations("Accessibility");
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(value, {
        margin: 1,
        width: 360,
        color: { dark: "#1d1c1d", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });
      if (!cancelled) setDataUrl(url);
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!dataUrl) {
    return <div className="h-[180px] w-[180px] animate-pulse rounded-2xl bg-surface-2" />;
  }

  return (
    <Image
      src={dataUrl}
      alt={t("qrCode")}
      width={180}
      height={180}
      unoptimized
      className="rounded-2xl border border-line bg-white p-2"
    />
  );
}
