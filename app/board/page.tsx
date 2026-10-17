"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle, Download, Layers, List, RefreshCw, ScanLine, X } from "lucide-react";
import { useSearch } from "@/context/SearchContext";
import DateFilterBar from "@/components/DateFilterBar";
import CaseBoard from "@/components/board/CaseBoard";
import CaseList, { type Group } from "@/components/board/CaseList";
import FileFinder from "@/components/board/FileFinder";
import PatientDrawer from "@/components/board/PatientDrawer";
import StatusStrip, { type SendingInfo } from "@/components/board/StatusStrip";
import WaitingHelp from "@/components/board/WaitingHelp";
import { CHIP_TITLE, OUTCOME_CHIPS, matchesChip, modalityName, useNow, type Chip } from "@/components/board/shared";
import { ErrorBanner, HeroButton, PageBody, PageHero, SyncNotice, TruncatedNotice } from "@/components/ui";
import { dateRange } from "@/lib/date-filter";
import { formatDateTime } from "@/lib/format";
import { useJson } from "@/lib/use-json";
import { STATES, type StateKey } from "@/lib/patient-states";
import { usePatients } from "@/lib/use-patients";
import type { boardOverview, healthSnapshot, systemStats } from "@/lib/overview";
import type { PatientRecord } from "@/lib/patient-data";

type Toast = { kind: "success" | "error"; message: string };
const CHIPS: Chip[] = ["all", "waiting", "pending", "sending", "sent", "attention", "failed", "invalid_number"];

/** The cases as a spreadsheet, for whoever asks "send me yesterday's list". */
function downloadCsv(rows: PatientRecord[]) {
  const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Patient", "Patient ID", "Accession", "Exam type", "Study", "Phone", "Status", "Received", "Sent"].map(cell).join(","),
    ...rows.map((p) =>
      [p.patientName, p.patientId, p.accessionNum, p.modality, p.studyDesc, p.whatsappNum, STATES[p.state === "send" ? "pending" : (p.state as StateKey)]?.label ?? p.state, formatDateTime(p.receivedAt), formatDateTime(p.sentAtIso)]
        .map(cell)
        .join(",")
    ),
  ];
  const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "nexta-cases.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function Board() {
  const { dateFilter } = useSearch();
  const { data, total, sync, isLoading, error, refresh, replaceRecord } = usePatients(dateFilter);
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow();

  const [modality, setModality] = useState("All");
  const [chip, setChip] = useState<Chip>("all");
  const [view, setView] = useState<"board" | "list">("board");
  const [group, setGroup] = useState<Group>("modality");
  const [filter, setFilter] = useState("");
  const [openCase, setOpenCase] = useState<{ id: number; focus: boolean } | null>(null);
  const [finder, setFinder] = useState<string | null>(null);
  const [moving, setMoving] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);

  // Links from other screens: ?case=12 opens that case, ?find=330930 opens the file finder, ?chip=waiting filters
  useEffect(() => {
    const id = params.get("case"), find = params.get("find"), wanted = params.get("chip") as Chip | null;
    if (!id && find === null && !wanted) return;
    if (id) setOpenCase({ id: Number(id), focus: false });
    if (find !== null) setFinder(find);
    if (wanted && CHIPS.includes(wanted)) setChip(wanted);
    router.replace("/board");
  }, [params, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // The date and exam type filters drive the numbers, the board and the list together
  const scoped = useMemo(() => data.filter((p) => modality === "All" || p.modality === modality), [data, modality]);
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return scoped.filter(
      (p) =>
        matchesChip(p, chip) &&
        (!q || [p.patientName, p.patientId, p.accessionNum, p.whatsappNum, p.studyDesc].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [scoped, chip, filter]);
  const modalities = useMemo(() => [...new Set(data.map((p) => p.modality).filter((m) => m && m !== "N/A"))].sort(), [data]);

  // Numbers that live on the server: what the imaging system has, the sender's mode, messages today
  const { from, to } = dateRange(dateFilter);
  const query = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(modality !== "All" ? { modality } : {}) }).toString();
  const refreshKey = `${data.length}|${Math.floor(now / 60000)}`;
  const overview = useJson<ReturnType<typeof boardOverview>>(`/api/admin/overview?${query}`, refreshKey);
  const health = useJson<Awaited<ReturnType<typeof healthSnapshot>>>("/api/admin/health", Math.floor(now / 120000));
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const stats = useJson<ReturnType<typeof systemStats>>(`/api/admin/stats?from=${todayKey}&to=${todayKey}`, refreshKey);

  const sending: SendingInfo | null = health.data
    ? { auto: health.data.sending.auto, dryRun: health.data.sending.dryRun, pausedUntil: health.data.sending.pausedUntil }
    : null;

  const say = useCallback((kind: Toast["kind"], message: string) => setToast({ kind, message }), []);

  const sendNow = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`/api/admin/patients/${id}/send`, { method: "POST" });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Could not send");
        replaceRecord(result.data);
      } catch (err: any) {
        say("error", err.message);
      }
    },
    [replaceRecord, say]
  );

  const moveCard = useCallback(
    async (p: PatientRecord, target: StateKey) => {
      setMoving((m) => new Set(m).add(p.id));
      try {
        const res = await fetch(`/api/admin/patients/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: STATES[target].dbState }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Could not move the card");
        replaceRecord(result.data);
        say("success", `${p.patientName} moved to ${STATES[target].label}`);
      } catch (err: any) {
        say("error", err.message);
      } finally {
        setMoving((m) => {
          const next = new Set(m);
          next.delete(p.id);
          return next;
        });
      }
    },
    [replaceRecord, say]
  );

  const saveNumber = useCallback(
    async (id: number, raw: string) => {
      try {
        const res = await fetch(`/api/admin/patients/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ whatsappNum: raw, countryCode: "20" }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Could not save the number");
        replaceRecord(result.data);
        say("success", `Number saved for ${result.data.patientName}`);
        return true;
      } catch (err: any) {
        say("error", err.message);
        return false;
      }
    },
    [replaceRecord, say]
  );

  const open = (id: number, focus = false) => setOpenCase({ id, focus });
  const lastReportAt = useMemo(() => {
    const times = scoped.map((p) => (p.reportAt ? Date.parse(p.reportAt) : NaN)).filter(Number.isFinite);
    return times.length ? Math.max(...times) : null;
  }, [scoped]);
  const attention = scoped.filter((p) => matchesChip(p, "attention")).length;

  return (
    <>
      <PageHero
        title="Board"
        subtitle={
          <>
            Everything that needs doing, in one place. <b className="text-white">{attention} cases</b> need a person right now.
          </>
        }
        actions={
          <>
            <DateFilterBar />
            <label className="flex h-10 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur">
              <ScanLine className="h-4 w-4 text-white/70" />
              <select value={modality} onChange={(e) => setModality(e.target.value)} className="bg-transparent text-white outline-none" aria-label="Exam type">
                <option className="text-ink-900" value="All">
                  All exam types
                </option>
                {modalities.map((m) => (
                  <option key={m} className="text-ink-900" value={m}>
                    {m} · {modalityName(m)}
                  </option>
                ))}
              </select>
            </label>
            <HeroButton onClick={refresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </HeroButton>
          </>
        }
      />

      <PageBody>
        {error && <ErrorBanner message={error} />}
        <SyncNotice sync={sync} />
        <TruncatedNotice shown={data.length} total={total} />

        <div className="space-y-5">
          <StatusStrip list={scoped} overview={overview.data} chip={chip} onChip={setChip} sending={sending} messagesToday={stats.data?.messages.total ?? null} now={now} />

          {chip === "waiting" && (
            <WaitingHelp
              incoming={health.data?.folders.incoming.path ?? ""}
              prepared={health.data?.folders.prepared.path ?? ""}
              lastReportAt={lastReportAt}
              example={visible[0]?.accessionNum ?? "330941"}
              onFind={(q) => setFinder(q)}
            />
          )}

          <section className="overflow-hidden rounded-2xl bg-white shadow-lg shadow-ink-900/10 ring-1 ring-slate-200/70">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{CHIP_TITLE[chip]}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{visible.length}</span>
                {chip !== "all" && (
                  <button type="button" onClick={() => setChip("all")} className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50">
                    Clear filter <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter this list…"
                  className="h-9 w-44 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
                />
                {view === "list" && !OUTCOME_CHIPS.includes(chip) && (
                  <label className="flex items-center gap-2 rounded-lg px-2.5 text-sm text-slate-500 ring-1 ring-slate-200">
                    <Layers className="h-4 w-4" />
                    Group by
                    <select value={group} onChange={(e) => setGroup(e.target.value as Group)} className="h-9 bg-transparent font-semibold text-ink-900 outline-none">
                      <option value="none">Nothing</option>
                      <option value="modality">Modality</option>
                      <option value="state">Status</option>
                    </select>
                  </label>
                )}
                <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                  {(["list", "board"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1 ${view === v ? "bg-white text-brand-600 shadow-sm" : "text-slate-500"}`}
                    >
                      {v === "list" ? <List className="h-4 w-4" /> : <KanbanIcon />}
                      {v === "list" ? "List" : "Board"}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => downloadCsv(visible)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : view === "list" || OUTCOME_CHIPS.includes(chip) ? (
              <CaseList list={visible} group={OUTCOME_CHIPS.includes(chip) ? "none" : group} now={now} onOpen={open} onFind={(acc) => setFinder(acc)} onSend={sendNow} />
            ) : (
              <CaseBoard list={visible} now={now} movingIds={moving} onOpen={open} onMove={moveCard} onSaveNumber={saveNumber} onShowOutcome={setChip} onSend={sendNow} />
            )}
          </section>
        </div>
      </PageBody>

      <PatientDrawer
        id={openCase?.id ?? null}
        focusPhone={openCase?.focus ?? false}
        onClose={() => setOpenCase(null)}
        onFind={(acc) => setFinder(acc)}
        onChanged={() => {
          overview.reload();
          health.reload();
        }}
      />
      <FileFinder query={finder} onClose={() => setFinder(null)} onOpenCase={(id) => (setFinder(null), open(id))} />

      {toast && (
        <div role="status" className={`fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${toast.kind === "success" ? "bg-ink-900" : "bg-rose-600"}`}>
          {toast.kind === "success" ? <CheckCircle2 className="h-4 w-4 text-teal-300" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </>
  );
}

// lucide's board icon (named differently across versions): a simple three-column glyph
function KanbanIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 7v7M12 7v3M16 7v10" />
    </svg>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <Board />
    </Suspense>
  );
}
