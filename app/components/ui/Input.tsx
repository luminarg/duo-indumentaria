import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

function FieldWrapper({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
}) {
  if (!label) return <>{children}</>;
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
      {label}
      {children}
      {hint && <span className="text-[11px] font-normal text-zinc-400">{hint}</span>}
    </label>
  );
}

const fieldClasses =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";

export function Input({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <FieldWrapper label={label} hint={hint}>
      <input className={cn(fieldClasses, "mt-1", className)} {...props} />
    </FieldWrapper>
  );
}

export function Textarea({
  label,
  hint,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  return (
    <FieldWrapper label={label} hint={hint}>
      <textarea className={cn(fieldClasses, "mt-1", className)} {...props} />
    </FieldWrapper>
  );
}

export function Select({
  label,
  hint,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string }) {
  return (
    <FieldWrapper label={label} hint={hint}>
      <select className={cn(fieldClasses, "mt-1", className)} {...props}>
        {children}
      </select>
    </FieldWrapper>
  );
}
