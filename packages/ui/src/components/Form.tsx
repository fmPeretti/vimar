import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "../cx";

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("vm-field", className)}>
      {label ? (
        <label className="vm-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <span className="vm-field__hint">{hint}</span> : null}
    </div>
  );
}

export function Input({
  className,
  numeric,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { numeric?: boolean }) {
  return <input {...rest} className={cx("vm-input", numeric && "vm-input--num", className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx("vm-select", className)}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx("vm-textarea", className)} />;
}

/** An input with a trailing unit label ("skein", "min", "oz"). */
export function InputWithSuffix({
  suffix,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { suffix: ReactNode; numeric?: boolean }) {
  return (
    <div className="vm-input-group">
      <Input {...rest} />
      <span className="vm-input-group__suffix">{suffix}</span>
    </div>
  );
}
