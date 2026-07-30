import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

function FieldWrapper({ label, children }: { label?: string; children: ReactNode }) {
  if (!label) return <>{children}</>;
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
      {label}
      {children}
    </label>
  );
}

const fieldClasses =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";

export function Input({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <FieldWrapper label={label}>
      <input className={cn(fieldClasses, "mt-1", className)} {...props} />
    </FieldWrapper>
  );
}

export function Textarea({
  label,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <FieldWrapper label={label}>
      <textarea className={cn(fieldClasses, "mt-1", className)} {...props} />
    </FieldWrapper>
  );
}

export function Select({
  label,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <FieldWrapper label={label}>
      <select className={cn(fieldClasses, "mt-1", className)} {...props}>
        {children}
      </select>
    </FieldWrapper>
  );
}
