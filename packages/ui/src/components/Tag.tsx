import type { ReactNode } from "react";
import { cx } from "../cx";

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("vm-tag", className)}>{children}</span>;
}

/** Selectable variant for the pattern tag picker. */
export function TagToggle({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="vm-tag" aria-pressed={selected} onClick={onToggle}>
      {label}
    </button>
  );
}
