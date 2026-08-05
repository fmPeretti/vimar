"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

/**
 * Blocking confirmation for destructive actions. Renders nothing when
 * `open` is false, so callers can mount it unconditionally.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. Off for non-destructive confirmations. */
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="vm-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="vm-modal" role="alertdialog" aria-modal="true" aria-labelledby="vm-modal-title">
        <h2 id="vm-modal-title" className="vm-modal__title">
          {title}
        </h2>
        {children ? <div className="vm-modal__body">{children}</div> : null}
        <div className="vm-modal__actions">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
