"use client";

import { CalendarDays } from "lucide-react";
import { useSearch } from "@/context/SearchContext";
import { DATE_PRESETS, toDateKey } from "@/lib/date-filter";

/** Date presets shown on the gradient header of the dashboard and organizer. */
export default function DateFilterBar({ light = false, pill = false }: { light?: boolean; pill?: boolean }) {
  const { dateFilter, setDateFilter } = useSearch();
  const today = toDateKey(new Date());

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className={`flex items-center gap-1 p-1 ring-1 ring-inset ${pill ? "rounded-full" : "rounded-xl"} ${
          light ? "bg-white shadow-sm shadow-brand-500/10 ring-slate-200/70" : "bg-white/10 ring-white/20 backdrop-blur"
        }`}
      >
        <CalendarDays className={`ml-2 mr-1 hidden h-4 w-4 sm:block ${light ? "text-brand-500" : "text-white/70"}`} />
        {DATE_PRESETS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() =>
              setDateFilter({
                preset: value,
                // Start a custom range at today so the inputs aren't blank
                from: value === "custom" ? dateFilter.from || today : dateFilter.from,
                to: value === "custom" ? dateFilter.to || today : dateFilter.to,
              })
            }
            className={`px-3 py-1.5 text-sm font-semibold transition ${pill ? "rounded-full px-4" : "rounded-lg"} ${
              dateFilter.preset === value
                ? light
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-white text-ink-900 shadow-sm"
                : light
                  ? "text-ink-800 hover:bg-brand-50"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {dateFilter.preset === "custom" && (
        <div className={`flex items-center gap-2 text-sm ${light ? "text-slate-600" : "text-white/80"}`}>
          <input
            type="date"
            aria-label="From date"
            value={dateFilter.from}
            max={dateFilter.to || undefined}
            onChange={(e) => setDateFilter({ ...dateFilter, from: e.target.value })}
            className={`h-9 rounded-lg border-0 bg-white px-2.5 text-sm text-ink-900 focus:outline-none focus:ring-4 ${
              light ? "ring-1 ring-slate-200 focus:ring-brand-500/20" : "focus:ring-white/30"
            }`}
          />
          <span>to</span>
          <input
            type="date"
            aria-label="To date"
            value={dateFilter.to}
            min={dateFilter.from || undefined}
            onChange={(e) => setDateFilter({ ...dateFilter, to: e.target.value })}
            className={`h-9 rounded-lg border-0 bg-white px-2.5 text-sm text-ink-900 focus:outline-none focus:ring-4 ${
              light ? "ring-1 ring-slate-200 focus:ring-brand-500/20" : "focus:ring-white/30"
            }`}
          />
        </div>
      )}
    </div>
  );
}
