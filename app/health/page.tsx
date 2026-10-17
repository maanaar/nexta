"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FolderInput, MessageCircle, RefreshCw, ScanLine, Smartphone, TriangleAlert } from "lucide-react";
import DateFilterBar from "@/components/DateFilterBar";
import { useNow, modalityName } from "@/components/board/shared";
import { HeroButton, PageBody, PageHero } from "@/components/ui";
import { useSearch } from "@/context/SearchContext";
import { dateRange } from "@/lib/date-filter";
import { formatMinutes, formatSeconds, formatWhen } from "@/lib/format";
import { useJson } from "@/lib/use-json";
import { usePatients } from "@/lib/use-patients";
import type { healthSnapshot, systemStats } from "@/lib/overview";

type Stats = ReturnType<typeof systemStats>;
type Health = Awaited<ReturnType<typeof healthSnapshot>>;
type Tone = "ok" | "warn" | "bad" | "idle";

const TONE: Record<Tone, { dot: string; text: string }> = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-700" },
  warn: { dot: "bg-amber-500", text: "text-amber-700" },
  bad: { dot: "bg-rose-500", text: "text-rose-700" },
  idle: { dot: "bg-slate-300", text: "text-slate-500" },
};

function Light({ tone, icon, title, line, detail, children }: { tone: Tone; icon: React.ReactNode; title: string; line: string; detail?: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/70">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span className="text-slate-400">{icon}</span>
        <span className="truncate">{title}</span>
        <span className={`ml-auto h-2.5 w-2.5 shrink-0 rounded-full ${TONE[tone].dot}`} />
      </div>
      <p className={`mt-1.5 text-sm font-semibold ${TONE[tone].text}`}>{line}</p>
      {detail && <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p>}
      {children}
    </div>
  );
}

function Kpi({ label, value, hint, href, tone = "text-ink-900" }: { label: string; value: string; hint: string; href?: string; tone?: string }) {
  const body = (
    <div className="h-full rounded-2xl bg-white p-4 shadow-lg shadow-ink-900/10 ring-1 ring-slate-200/70 transition hover:ring-brand-300">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Step({ label, value, of, stopped, stoppedLabel, tone }: { label: string; value: number | null; of: number | null; stopped?: number; stoppedLabel?: string; tone: string }) {
  const pct = value !== null && of ? Math.min(100, Math.round((value / of) * 100)) : 0;
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/70">
      <p className="min-h-8 text-[11px] font-bold uppercase leading-4 tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value === null ? "—" : value}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 min-h-4 text-xs text-slate-500">{stopped ? `${stopped} ${stoppedLabel}` : " "}</p>
    </div>
  );
}

function Gap({ text, note }: { text: string; note?: string }) {
  return (
    <div className="flex shrink-0 flex-row items-center justify-center gap-1 text-center text-xs text-slate-500 lg:w-24 lg:flex-col">
      <ArrowRight className="h-4 w-4 rotate-90 text-slate-300 lg:rotate-0" />
      <b className="text-slate-700">{text}</b>
      {note && <span className="text-[10px] leading-tight text-slate-400">{note}</span>}
    </div>
  );
}

/** Messages per day: sent by itself, by a person, and sent again — stacked bars, no library needed. */
function DailyChart({ days }: { days: Stats["daily"] }) {
  const max = Math.max(1, ...days.map((d) => d.auto + d.manual + d.again));
  return (
    <div>
      <div className="flex h-40 items-end gap-2">
        {days.map((d) => {
          const total = d.auto + d.manual + d.again;
          const seg = (n: number, cls: string) => (n ? <div className={cls} style={{ height: `${(n / max) * 100}%` }} title={`${n}`} /> : null);
          return (
            <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs font-semibold text-slate-600">{total || ""}</span>
              <div className="flex w-full max-w-10 flex-1 flex-col-reverse overflow-hidden rounded-t-md">
                {seg(d.auto, "bg-brand-500")}
                {seg(d.manual, "bg-teal-400")}
                {seg(d.again, "bg-amber-400")}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {days.map((d) => (
          <span key={d.date} className="min-w-0 flex-1 truncate text-center text-[11px] text-slate-400">
            {new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand-500" />By itself</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-teal-400" />By a person</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400" />Sent again</span>
      </div>
    </div>
  );
}

/** How long patients wait, by the hour their exam reached Nexta (AM/PM labels). */
function HourChart({ hours }: { hours: Stats["waitByHour"] }) {
  const max = Math.max(1, ...hours.map((h) => h ?? 0));
  const label = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "AM" : "PM"}`;
  const shown = hours.map((v, h) => ({ v, h })).filter((x) => x.h >= 6 && x.h <= 22);
  if (hours.every((h) => h === null)) return <p className="py-14 text-center text-sm text-slate-400">No messages sent yet in this period.</p>;
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {shown.map(({ v, h }) => (
          <div key={h} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={v === null ? "No data" : formatMinutes(v)}>
            <span className="text-[10px] font-semibold text-slate-500">{v ?? ""}</span>
            <div className={`w-full max-w-6 rounded-t-md ${v === null ? "" : "bg-brand-500"}`} style={{ height: v === null ? 0 : `${Math.max(4, (v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {shown.map(({ h }) => (
          <span key={h} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-400">{label(h)}</span>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Minutes from the exam reaching Nexta to the report being sent.</p>
    </div>
  );
}

export default function HealthPage() {
  const { dateFilter } = useSearch();
  const { data } = usePatients(dateFilter);
  const now = useNow();
  const [modality, setModality] = useState("All");
  const [checks, setChecks] = useState(0);

  const { from, to } = dateRange(dateFilter);
  const query = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(modality !== "All" ? { modality } : {}) }).toString();
  const refreshKey = `${checks}|${Math.floor(now / 60000)}`;
  const stats = useJson<Stats>(`/api/admin/stats?${query}`, refreshKey);
  // "Refresh" also asks Meta whether the WhatsApp login still works
  const health = useJson<Health>(checks > 0 ? "/api/admin/health?check=1" : "/api/admin/health", `${checks}|${Math.floor(now / 120000)}`);
  const modalities = useMemo(() => [...new Set(data.map((p) => p.modality).filter((m) => m && m !== "N/A"))].sort(), [data]);

  const h = health.data;
  const s = stats.data;
  const j = s?.journey;

  const imaging: Tone = !h ? "idle" : h.imaging.ok ? "ok" : "bad";
  const phones: Tone = !h ? "idle" : h.phones.ok ? "ok" : "warn";
  const whatsapp: Tone = !h ? "idle" : !h.whatsapp.configured ? "bad" : h.whatsapp.ok === false ? "bad" : h.whatsapp.ok ? "ok" : "idle";
  const folders: Tone = !h ? "idle" : !h.folders.prepared.exists ? "bad" : h.folders.incoming.set && !h.folders.incoming.exists ? "bad" : "ok";
  const tones = [imaging, phones, whatsapp, folders];
  const problems = tones.filter((t) => t === "bad").length + tones.filter((t) => t === "warn").length;
  const verdict = !h ? "Checking…" : problems === 0 ? "Everything is working" : `${problems} thing${problems > 1 ? "s" : ""} need${problems > 1 ? "" : "s"} a look`;

  const sendingMode = !h ? "" : h.sending.pausedUntil ? "Paused for now" : h.sending.dryRun ? "Test mode — nothing is really sent" : h.sending.auto ? "Sends by itself" : "Manual only";

  return (
    <>
      <PageHero
        title="System health"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <i className={`h-2.5 w-2.5 rounded-full ${problems === 0 && h ? "bg-emerald-400" : h ? "bg-amber-400" : "bg-slate-400"}`} />
            <b className="text-white">{verdict}</b>
            {h && <span className="text-white/70">· checked {formatWhen(h.checkedAt)}</span>}
          </span>
        }
        actions={
          <>
            <DateFilterBar />
            <label className="flex h-10 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur">
              <ScanLine className="h-4 w-4 text-white/70" />
              <select value={modality} onChange={(e) => setModality(e.target.value)} className="bg-transparent text-white outline-none" aria-label="Exam type">
                <option className="text-ink-900" value="All">All exam types</option>
                {modalities.map((m) => (
                  <option key={m} className="text-ink-900" value={m}>
                    {m} · {modalityName(m)}
                  </option>
                ))}
              </select>
            </label>
            <HeroButton onClick={() => setChecks((c) => c + 1)} disabled={health.loading}>
              <RefreshCw className={`h-4 w-4 ${health.loading ? "animate-spin" : ""}`} />
              Refresh
            </HeroButton>
          </>
        }
      />

      <PageBody>
        <div className="space-y-5">
          {/* Is everything working? */}
          <section className="rounded-2xl bg-white p-4 shadow-lg shadow-ink-900/10 ring-1 ring-slate-200/70">
            <h2 className="mb-3 font-semibold">Is everything working?</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Light
                tone={imaging}
                icon={<ScanLine className="h-4 w-4" />}
                title="Imaging system"
                line={!h ? "Checking…" : h.imaging.ok ? "Connected" : "Can't be read right now"}
                detail={h ? (h.imaging.ok ? `Last looked ${formatWhen(h.imaging.lastSyncAt)}` : h.imaging.error ?? undefined) : undefined}
              />
              <Light
                tone={phones}
                icon={<Smartphone className="h-4 w-4" />}
                title="Patient phone numbers"
                line={!h ? "Checking…" : h.phones.ok ? "Coming in" : "Not reachable"}
                detail={h ? (h.phones.ok ? `Last from the hospital system ${formatWhen(h.phones.lastMessageAt)} · ${h.phones.typedToday} typed by hand today` : h.phones.error ?? undefined) : undefined}
              />
              <Light
                tone={whatsapp}
                icon={<MessageCircle className="h-4 w-4" />}
                title="WhatsApp"
                line={!h ? "Checking…" : !h.whatsapp.configured ? "Not set up" : h.whatsapp.ok === false ? "Signed out" : h.whatsapp.ok ? "Signed in" : "Set up"}
                detail={h ? (h.whatsapp.message ?? sendingMode) : undefined}
              >
                {h && h.whatsapp.message && <p className="mt-0.5 truncate text-xs text-slate-500">{sendingMode}</p>}
              </Light>
              <Light
                tone={folders}
                icon={<FolderInput className="h-4 w-4" />}
                title="Reports"
                line={!h ? "Checking…" : folders === "bad" ? "A folder can't be found" : "Arriving and prepared"}
                detail={h ? `Last report arrived ${formatWhen(h.folders.prepared.lastFileAt)}` : undefined}
              >
                {h && h.preparation.enabled && h.preparation.lastSeconds !== null && <p className="mt-0.5 text-xs text-slate-500">Preparing takes about {formatSeconds(h.preparation.lastSeconds)}</p>}
              </Light>
            </div>
          </section>

          {/* The four numbers */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Exams received" value={j ? String(j.reached) : "—"} hint={j?.examsInEtiam != null ? `of ${j.examsInEtiam} in the imaging system` : "in this period"} />
            <Kpi label="Still waiting for a report" value={j ? String(j.waiting) : "—"} hint={j && j.waitingHeld ? `${j.waitingHeld} have a file we could not use` : "See them on the Board"} href="/board?chip=waiting" tone={j && j.waiting ? "text-amber-600" : undefined} />
            <Kpi label="Messages sent" value={s ? String(s.messages.total) : "—"} hint={s ? `${s.messages.auto} by itself · ${s.messages.manual} by a person · ${s.messages.again} again` : "in this period"} />
            <Kpi label="Wait for the patient" value={s ? formatMinutes(s.timings.examToSentMinutes) : "—"} hint="from reaching Nexta to the message" />
          </section>

          {/* Journey of an exam */}
          <section className="rounded-2xl bg-white p-4 shadow-lg shadow-ink-900/10 ring-1 ring-slate-200/70">
            <h2 className="font-semibold">The journey of an exam</h2>
            <p className="mb-3 text-xs text-slate-500">Each exam is counted at the last step it reached; what stopped it is shown underneath.</p>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
              <Step label="In the imaging system" value={j?.examsInEtiam ?? null} of={j?.examsInEtiam ?? null} tone="bg-slate-500" />
              <Gap text="?" note="needs a time from the imaging system" />
              <Step label="Reached Nexta" value={j?.reached ?? null} of={j?.examsInEtiam ?? j?.reached ?? null} stopped={j?.notReceived ?? 0} stoppedLabel="never reached Nexta" tone="bg-brand-500" />
              <Gap text={formatSeconds(s?.timings.fileToReadySeconds)} note="report file to ready" />
              <Step label="Report ready" value={j?.reportReady ?? null} of={j?.reached ?? null} stopped={j?.waiting} stoppedLabel="still waiting for a report" tone="bg-teal-500" />
                            <Step label="Phone number OK" value={j?.phoneConfirmed ?? null} of={j?.reached ?? null} stopped={(j?.noNumber ?? 0) + (j?.badFormat ?? 0)} stoppedLabel="no number or not valid" tone="bg-sky-500" />
              <Gap text={formatSeconds(s?.timings.readyToSentSeconds)} note="includes the safety wait" />
              <Step label="Sent" value={j?.sent ?? null} of={j?.reached ?? null} stopped={(j?.failed ?? 0) + (j?.refused ?? 0)} stoppedLabel="failed or refused" tone="bg-emerald-500" />
            </div>
            {j && j.queued > 0 && <p className="mt-3 text-xs text-slate-500">{j.queued} more are ready and queued to send.</p>}
          </section>

          {/* Charts */}
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 shadow-lg shadow-ink-900/10 ring-1 ring-slate-200/70">
              <h2 className="mb-3 font-semibold">Messages per day</h2>
              {s ? <DailyChart days={s.daily} /> : <div className="h-48 animate-pulse rounded-xl bg-slate-100" />}
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-lg shadow-ink-900/10 ring-1 ring-slate-200/70">
              <h2 className="mb-3 font-semibold">Wait for the patient, by hour of the exam</h2>
              {s ? <HourChart hours={s.waitByHour} /> : <div className="h-48 animate-pulse rounded-xl bg-slate-100" />}
            </div>
          </section>

          {(stats.error || health.error) && (
            <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
              <TriangleAlert className="h-4 w-4" />
              {stats.error || health.error}
            </p>
          )}
        </div>
      </PageBody>
    </>
  );
}
