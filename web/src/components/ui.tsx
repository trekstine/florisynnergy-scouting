"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 border-transparent",
  outline: "bg-white text-ink border-line hover:bg-surface",
  ghost: "bg-transparent text-ink-soft border-transparent hover:bg-surface",
  danger: "bg-red-600 text-white hover:bg-red-700 border-transparent",
};

export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("rounded-xl border border-line bg-white shadow-card", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Badge({
  children,
  color,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        !color && "bg-surface text-ink-soft",
        className,
      )}
      style={color ? { backgroundColor: `${color}1a`, color } : undefined}
    >
      {color && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      )}
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputCls, props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputCls, props.className)} />;
}

export function ErrorBox({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
      {message}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-faint">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      {label}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-faint">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-6 pt-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-faint">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
