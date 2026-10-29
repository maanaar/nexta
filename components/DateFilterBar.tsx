"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import DatePicker from "@/components/DatePicker";
import { useSearch } from "@/context/SearchContext";
import { DATE_PRESETS, toDateKey } from "@/lib/date-filter";

/** Date presets shown on the gradient header of the dashboard and organizer. "Custom" is one day or a period (from and to). */
export default function DateFilterBar() {
  const { dateFilter, setDateFilter } = useSearch();
  const today = toDateKey(new Date());
  // One day when from and to are the same (the start of a custom filter), a period otherwise
  const [mode, setMode] = useState<"day" | "period">(dateFilter.from && dateFilter.to && dateFilter.from !== dateFilter.to ? "period" : "day");

  const chooseMode = (next: "day" | "period") => {
    setMode(next);
    // A single day filters from that day to that day
    if (next === "day") {
      const day = dateFilter.from || today;
      setDateFilter({ ...dateFilter, from: day, to: day });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1 ring-1 ring-inset ring-white/20 backdrop-blur">
        <CalendarDays className="ml-2 mr-1 hidden h-4 w-4 text-white/70 sm:block" />
        {DATE_PRESETS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() =>
              setDateFilter({
                preset: value,
                // Start a custom filter at today so the pickers aren't blank
                from: value === "custom" ? dateFilter.from || today : dateFilter.from,
                to: value === "custom" ? dateFilter.to || today : dateFilter.to,
              })
            }
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              dateFilter.preset === value ? "bg-white text-ink-900 shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {dateFilter.preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/80">
          <div className="flex items-center gap-0.5 rounded-lg bg-white/10 p-0.5 ring-1 ring-inset ring-white/20" role="group" aria-label="One day or a period">
            {(["day", "period"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => chooseMode(m)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition ${mode === m ? "bg-white text-ink-900" : "text-white/80 hover:text-white"}`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === "day" ? (
            <DatePicker value={dateFilter.from} onChange={(day) => setDateFilter({ ...dateFilter, from: day, to: day })} />
          ) : (
            <>
              <span>From</span>
              <DatePicker value={dateFilter.from} max={dateFilter.to || undefined} onChange={(day) => setDateFilter({ ...dateFilter, from: day })} />
              <span>to</span>
              <DatePicker value={dateFilter.to} min={dateFilter.from || undefined} onChange={(day) => setDateFilter({ ...dateFilter, to: day })} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
