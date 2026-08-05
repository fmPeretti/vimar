import type { ReactNode } from "react";
import { cx } from "../cx";

/**
 * Screen header for back-office views. The `note` is set in the handwritten
 * script face so data-dense screens keep the brand's voice.
 */
export function PageHeader({
  title,
  note,
  children,
}: {
  title: ReactNode;
  note?: ReactNode;
  /** Actions, right-aligned. */
  children?: ReactNode;
}) {
  return (
    <div className="vm-page-head">
      <div>
        <h1 className="vm-page-title">{title}</h1>
        {note ? <div className="vm-page-note">{note}</div> : null}
      </div>
      {children ? <div className="vm-page-head__actions">{children}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  children,
  footer,
  tone,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tone?: "sticker";
  className?: string;
}) {
  return (
    <div className={cx("vm-panel", tone === "sticker" && "vm-panel--sticker", className)}>
      {title ? <h2 className="vm-panel__title">{title}</h2> : null}
      {children}
      {footer ? <div className="vm-panel__foot">{footer}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "cream",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "cream" | "yellow" | "pink";
}) {
  return (
    <div className={cx("vm-stat", tone !== "cream" && `vm-stat--${tone}`)}>
      <div className="vm-stat__label">{label}</div>
      <div className="vm-stat__value">{value}</div>
      {sub ? <div className="vm-stat__sub">{sub}</div> : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={cx("vm-alert", `vm-alert--${tone}`)} role={tone === "error" ? "alert" : undefined}>
      {title ? <div className="vm-alert__title">{title}</div> : null}
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="vm-empty">
      <div className="vm-empty__title">{title}</div>
      {children}
    </div>
  );
}

/** Table wrapper that keeps wide tables scrolling inside their own card. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="vm-table-wrap">
      <table className="vm-table">{children}</table>
    </div>
  );
}

/** Stock level bar — magenta when healthy, pink when low, burgundy when out. */
export function StockMeter({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const state = value <= 0 ? "out" : pct <= 100 / 3 ? "low" : "ok";
  return (
    <div className="vm-meter">
      <div
        className={cx("vm-meter__fill", state !== "ok" && `vm-meter__fill--${state}`)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
