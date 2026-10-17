"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Search, X, XCircle } from "lucide-react";
import type { findFiles } from "@/lib/overview";
import { formatWhen } from "@/lib/format";
import { StateBadge } from "@/components/ui";
import Drawer from "./Drawer";

type Result = NonNullable<ReturnType<typeof findFiles>>;

type Props = {
  /** null closes the finder; a string opens it and looks for that straight away (may be empty) */
  query: string | null;
  onClose: () => void;
  onOpenCase: (id: number) => void;
};

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes > 1024 * 1024 * 10 ? 0 : 1)} MB`;

function FolderResult({ title, path, files, unused }: { title: string; path: string; files: Result["incoming"]["files"]; unused: string }) {
  if (files === null)
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{unused}</p>
      </div>
    );
  const found = files.length > 0;
  return (
    <div className={`rounded-xl border p-4 ${found ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/60"}`}>
      <p className={`text-xs font-bold uppercase tracking-wider ${found ? "text-emerald-700" : "text-rose-700"}`}>{title}</p>
      <p className="font-mono text-xs text-slate-500">{path}</p>
      <p className={`mt-2 flex items-center gap-2 font-semibold ${found ? "text-emerald-700" : "text-rose-700"}`}>
        {found ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {found ? (files.length === 1 ? "Found" : `Found ${files.length} files`) : "Not found"}
      </p>
      {files.map((f) => (
        <div key={f.name} className="mt-2 border-t border-emerald-100 pt-2">
          <p className="break-all font-mono text-sm font-semibold">{f.name}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            Created <b>{formatWhen(f.createdAt)}</b> · {mb(f.size)}
          </p>
          {f.heldReason && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {f.heldReason}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Body({ query, onClose, onOpenCase }: Props & { query: string }) {
  const [text, setText] = useState(query);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/files?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not look for the file");
      setResult(body.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (query.trim()) search(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prepared = result?.prepared.files ?? [];
  const incoming = result?.incoming.files ?? [];
  const compressing = !!result && incoming.length > 0 && prepared.length === 0;

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <p className="font-display text-lg font-bold">Find a report file</p>
          <p className="text-xs text-slate-500">Looks for an accession number or patient ID in both folders.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search(text);
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Accession number or patient ID"
            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-500/15"
          />
          <button disabled={loading || !text.trim()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </form>
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {result && (
          <div className="space-y-3">
            <FolderResult title="1 · Reports arrive in" path={result.incoming.path} files={result.incoming.files} unused="Not used here: reports are read straight from the report folder." />
            <FolderResult title="2 · Prepared reports in" path={result.prepared.path} files={result.prepared.files} unused="No report folder is set." />
            {compressing && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                The file is in the folder where reports arrive, but not in the prepared folder yet. Preparation may still be running, or it failed. Check System health.
              </p>
            )}
            <div className="rounded-xl bg-slate-50 p-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Case</p>
              {result.cases.length === 0 ? (
                <p className="mt-1 font-semibold">No case with this number in Nexta</p>
              ) : (
                <ul className="mt-1 space-y-2">
                  {result.cases.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => onOpenCase(c.id)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left">
                        <span className="font-semibold hover:text-brand-600">{c.patient_name || "Unknown patient"}</span>
                        <span className="text-slate-500">
                          {c.modality} · {c.study_desc}
                        </span>
                        <StateBadge state={c.state === "send" ? "send" : c.state} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function FileFinder(props: Props) {
  return (
    <Drawer open={props.query !== null} onClose={props.onClose} z={60}>
      {props.query !== null && <Body key={props.query} {...props} query={props.query} />}
    </Drawer>
  );
}
