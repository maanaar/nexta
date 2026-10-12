"use client";

import type { ReactNode } from "react";
import { DatabaseZap, Info, ShieldPlus, TriangleAlert } from "lucide-react";
import type { SyncStatus } from "@/lib/etiam-sync";
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
  light = false,
  compact = false,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** Soft pastel header instead of the dark gradient band */
  light?: boolean;
  /** Dark header with less bottom padding, for pages whose content doesn't overlap it */
  compact?: boolean;
  /** Icon shown to the left of the title */
  icon?: ReactNode;
}) {
  return (
    <section className={light ? "page-hero-light pb-8 pt-10 text-ink-900" : `page-hero ${compact ? "pb-8" : "pb-24"} pt-10 text-white `}>
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-4 sm:px-6 lg:px-10">
        {children}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className={icon ? "flex items-center gap-4" : undefined}>
            {icon}
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
              {subtitle && (
                <p className={`mt-2 max-w-2xl text-sm sm:text-base ${light ? "text-slate-600" : "text-white/75"}`}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </section>
  );
}

export function PageBody({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <div className={`relative mx-auto max-w-screen-2xl px-4 pb-16 sm:px-6 lg:px-10 ${light ? "" : "-mt-16"}`}>
      {children}
    </div>
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
  light = false,
  pill = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  light?: boolean;
  /** Fully rounded ends */
  pill?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
        pill ? "rounded-full px-5" : "rounded-xl"
      } ${
        light
          ? "bg-white text-brand-600 shadow-sm shadow-brand-500/10 ring-1 ring-inset ring-slate-200/70 hover:bg-brand-50"
          : "bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur hover:bg-white/25"
      }`}
    >
      {children}
    </button>
  );
}

export function SyncNotice({ sync }: { sync: SyncStatus | null }) {
  if (!sync) return null;
  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2 mt-4">
      {sync.etiamError && (
        <div className="flex items-center gap-4 rounded-2xl border border-orange-200/70 bg-linear-to-r from-orange-50 to-amber-50/40 px-5 py-4 text-sm shadow-md shadow-orange-500/10">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-500">
            <DatabaseZap className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 text-orange-900/80">
            <strong className="font-semibold text-orange-600">Can&apos;t read the ETIAM database.</strong> Showing the
            last synced data.
            <span className="block text-xs text-orange-700/80">{sync.etiamError}</span>
          </span>
          <TriangleAlert className="h-7 w-7 shrink-0 text-orange-400" />
        </div>
      )}
      {sync.hl7Error && (
        <div className="flex items-center gap-4 rounded-2xl border border-brand-300/60 bg-linear-to-r from-white to-brand-50 px-5 py-4 text-sm text-ink-900 shadow-md shadow-brand-500/10">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
            <Info className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            Phone numbers aren&apos;t being read from HL7. You can still add them by hand.
            <span className="block text-xs text-slate-500">{sync.hl7Error}</span>
          </span>
          <ShieldPlus className="h-10 w-10 shrink-0 text-brand-200" />
        </div>
      )}
    </div>
  );
}

/** Shown when the server capped the result, so older jobs aren't silently missing. */
export function TruncatedNotice({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
      Showing the newest {shown.toLocaleString()} of {total.toLocaleString()} studies. Pick a date range to see older ones.
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </div>
  );
}
