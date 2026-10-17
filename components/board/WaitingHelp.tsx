"use client";

import { useState } from "react";
import { MapPin, Search } from "lucide-react";
import { formatWhen } from "@/lib/format";

/** Shown when the list is "Waiting for PDF": where the files should be, and a way to have Nexta look for one. */
export default function WaitingHelp({
  incoming,
  prepared,
  lastReportAt,
  example,
  onFind,
}: {
  incoming: string;
  prepared: string;
  lastReportAt: number | null;
  example: string;
  onFind: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <div className="grid gap-3 rounded-2xl bg-white p-4 shadow-lg shadow-ink-900/10 ring-1 ring-slate-200/70 md:grid-cols-4">
      <div>
        <p className="flex items-center gap-2 font-semibold">
          <MapPin className="h-4 w-4 text-brand-500" />
          Where to check
        </p>
        <p className="text-xs text-slate-500">
          These cases have no report yet. The last report arrived <b>{lastReportAt ? formatWhen(lastReportAt) : "—"}</b>.
        </p>
      </div>
      {incoming ? (
        <div className="min-w-0 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/70">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">1 · Reports arrive in</p>
          <p className="truncate font-mono text-sm font-bold" title={incoming}>
            {incoming}
          </p>
        </div>
      ) : (
        <div className="hidden md:block" />
      )}
      <div className="min-w-0 rounded-xl bg-teal-50/60 p-3 ring-1 ring-teal-200/70">
        <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">{incoming ? "2 · Prepared reports in" : "Reports are read from"}</p>
        <p className="truncate font-mono text-sm font-bold" title={prepared}>
          {prepared || "No folder set"}
        </p>
      </div>
      <div className="rounded-xl bg-brand-50/70 p-3 ring-1 ring-brand-200/70">
        <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">We look for</p>
        <p className="text-sm font-semibold">a file with the exam&apos;s accession number in its name</p>
      </div>
      <form
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-sm md:col-span-4"
        onSubmit={(e) => {
          e.preventDefault();
          onFind(query);
        }}
      >
        <span className="text-slate-600">Or, instead of checking by hand, type an accession number or patient ID and Nexta will look for it:</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`e.g. ${example}`}
          className="h-9 w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
        />
        <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white hover:bg-brand-500">
          <Search className="h-4 w-4" />
          Look for it
        </button>
      </form>
    </div>
  );
}
