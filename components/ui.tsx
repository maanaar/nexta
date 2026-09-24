"use client";

import type { ReactNode } from "react";
import { getStateMeta } from "@/lib/patient-states";
import { initials } from "@/lib/use-patients";

export function StateBadge({ state }: { state: string }) {
  const meta = getStateMeta(state);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-16 w-16 text-xl",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-500 to-teal-400 font-semibold text-white shadow-sm ${sizes[size]}`}
    >
      {initials(name)}
    </span>
  );
}

export function PageHero({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="page-hero pb-24 pt-10 text-white">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-4 sm:px-6 lg:px-10">
        {children}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-2 max-w-2xl text-sm text-white/75 sm:text-base">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </section>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto -mt-16 max-w-screen-2xl px-4 pb-16 sm:px-6 lg:px-10">{children}</div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-ink-900/5 ${className}`}>
      {children}
    </div>
  );
}

export function HeroButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-inset ring-white/25 backdrop-blur transition hover:bg-white/25 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </div>
  );
}
