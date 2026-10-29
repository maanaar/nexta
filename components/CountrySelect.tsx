"use client";

import { ChevronDown } from "lucide-react";
import { COUNTRIES } from "@/lib/phone";

/**
 * The country code next to a phone number. Closed, it shows only "+20" so the number gets the room; the list
 * has the country names. (A native select laid invisibly over the code, so it works with keyboard and touch.)
 */
export default function CountrySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const known = COUNTRIES.some((c) => c.code === value);
  return (
    <div className="relative h-11 w-[5.25rem] shrink-0 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-ink-900 transition focus-within:border-teal-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-teal-400/20">
      <span className="pointer-events-none flex h-full items-center pl-3 pr-6 tabular-nums">+{value}</span>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <select
        aria-label="Country code"
        title="Country code"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {!known && <option value={value}>+{value}</option>}
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            +{c.code} {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
