import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx("vm-btn", `vm-btn--${variant}`, size !== "md" && `vm-btn--${size}`, className)}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}

/** Same look, but renders an anchor — for navigation rather than actions. */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cx("vm-btn", `vm-btn--${variant}`, size !== "md" && `vm-btn--${size}`);
}
