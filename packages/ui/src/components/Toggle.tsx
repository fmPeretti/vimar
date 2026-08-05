import type { ReactNode } from "react";
import { cx } from "../cx";

/**
 * Rounded-square checkbox. Renders a real `<input>` behind the styled box so
 * keyboard and screen-reader behaviour comes for free.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cx("vm-check", checked && "vm-check--done", className)}>
      <input
        type="checkbox"
        className="vm-check__input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="vm-check__box" aria-hidden="true">
        ✓
      </span>
      {label ? <span className="vm-check__label">{label}</span> : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="vm-switch">
      <input
        type="checkbox"
        role="switch"
        className="vm-switch__input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="vm-switch__track" aria-hidden="true">
        <span className="vm-switch__thumb" />
      </span>
      {label}
    </label>
  );
}
