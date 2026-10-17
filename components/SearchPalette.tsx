"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileSearch, Search } from "lucide-react";
import type { PatientRecord } from "@/lib/patient-data";
import { Avatar, StateBadge } from "@/components/ui";

/** One search for everything: patients on any date, and the report files in both folders. Opens with Ctrl K or "/". */
export default function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    const text = q.trim();
    if (!open || text.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(text)}`, { cache: "no-store" });
        const body = await res.json();
        setResults(res.ok ? body.data : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const go = (url: string) => {
    onClose();
    router.push(url);
  };
  const text = q.trim();

  return (
    <div className="fixed inset-0 z-[70] bg-ink-950/40 p-4 pt-[10vh] backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mx-auto max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) go(`/board?case=${results[0].id}`);
              else if (e.key === "Enter" && text) go(`/board?find=${encodeURIComponent(text)}`);
            }}
            placeholder="Name, accession, phone, or a report file…"
            className="h-14 flex-1 bg-transparent text-base outline-none"
          />
          <kbd className="rounded border border-slate-200 px-1.5 text-[11px] text-slate-400">Esc</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {text.length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">Type at least two letters or digits.</p>
          ) : (
            <>
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Patients {loading && "…"}</p>
              {results.length === 0 && !loading && <p className="px-3 py-2 text-sm text-slate-400">No patient matches.</p>}
              {results.map((p) => (
                <button key={p.id} type="button" onClick={() => go(`/board?case=${p.id}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-brand-50">
                  <Avatar name={p.patientName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{p.patientName}</b>
                    <span className="text-xs text-slate-500">
                      {p.studyDesc} · {p.accessionNum} · {p.createdOn}
                    </span>
                  </span>
                  <StateBadge state={p.state} />
                </button>
              ))}
              <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Report files</p>
              <button type="button" onClick={() => go(`/board?find=${encodeURIComponent(text)}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-brand-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <FileSearch className="h-4 w-4" />
                </span>
                <span className="flex-1">
                  <b className="block text-sm">Look for a report file with “{text}” in its name</b>
                  <span className="text-xs text-slate-500">Searches both folders</span>
                </span>
                <CornerDownLeft className="h-4 w-4 text-slate-400" />
              </button>
            </>
          )}
        </div>
        <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">Searches every date, not just the one on screen.</p>
      </div>
    </div>
  );
}
