"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("Common");
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-xl font-bold tracking-tight">
          {title}
        </h2>
        <p id="confirm-desc" className="mt-2 text-sm leading-6 text-muted">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={busy}
            ref={confirmRef}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
