"use client";

import { useState } from "react";
import { Search } from "lucide-react";

/** Shown when the list is "Waiting for PDF": a way to have Nexta look for a report by accession number or patient ID. */
export default function WaitingHelp({ example, onFind }: { example: string; onFind: (query: string) => void }) {
  const [query, setQuery] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-white p-4 text-sm shadow-lg shadow-ink-900/10 ring-1 ring-slate-200/70"
      onSubmit={(e) => {
        e.preventDefault();
        onFind(query);
      }}
    >
      <span className="text-slate-600">Type an accession number or patient ID and Nexta will look for its report:</span>
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
  );
}
