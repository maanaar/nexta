"use client";

import Link from "next/link";
import { FileCheck2, Inbox, ScanLine, Send, Smartphone, type LucideIcon } from "lucide-react";
import { formatSeconds } from "@/lib/format";
import type { systemStats } from "@/lib/overview";

type Stats = ReturnType<typeof systemStats>;
type Tone = "amber" | "slate" | "orange" | "rose" | "sky";
type Miss = { n: number; title: string; note?: string; tone: Tone; href?: string };
type StepData = { icon: LucideIcon; title: string; value: number | null; percent: number; caption: string; colors: [string, string]; misses: Miss[] };

const CHIP: Record<Tone, string> = {
  amber: "bg-amber-50 text-amber-800 ring-amber-300/60",
  slate: "bg-slate-100 text-slate-700 ring-slate-300/70",
  orange: "bg-orange-50 text-orange-800 ring-orange-300/60",
  rose: "bg-rose-50 text-rose-800 ring-rose-300/60",
  sky: "bg-sky-50 text-sky-800 ring-sky-300/60",
};
const DOT: Record<Tone, string> = { amber: "bg-amber-500", slate: "bg-slate-400", orange: "bg-orange-500", rose: "bg-rose-500", sky: "bg-sky-500" };

const R = 46;
const LEN = 2 * Math.PI * R;
const pct = (n: number, of: number) => (of > 0 ? Math.min(100, (n / of) * 100) : 0);
const label = (n: number, of: number, what: string) => (of > 0 ? `${Math.round(pct(n, of))}% of the ${what}` : "—");

/** The journey of an exam, from the scan to the patient's WhatsApp: a ring per step, the time between steps, and what has not made it yet. */
export default function Journey({ stats }: { stats: Stats | null }) {
  const j = stats?.journey;
  const t = stats?.timings;
  const exams = j?.examsInEtiam ?? j?.reached ?? 0;
  const steps: StepData[] = [
    { icon: ScanLine, title: "Exam done", value: j?.examsInEtiam ?? null, percent: j?.examsInEtiam ? 100 : 0, caption: "exams in the imaging system", colors: ["#1B4A78", "#3B7DD8"], misses: [] },
    {
      icon: Inbox,
      title: "Reached Nexta",
      value: j?.reached ?? null,
      percent: pct(j?.reached ?? 0, exams),
      caption: label(j?.reached ?? 0, exams, "exams"),
      colors: ["#1F7AE0", "#4A9BF5"],
      misses: [
        ...(j && j.notReceived ? [{ n: j.notReceived, title: "never reached Nexta", note: "not received from the imaging system", tone: "amber" as Tone }] : []),
        ...(j && j.noAccession ? [{ n: j.noAccession, title: "no accession number", note: "no report can be matched", tone: "rose" as Tone, href: "/board?chip=attention" }] : []),
      ],
    },
    {
      icon: FileCheck2,
      title: "Report ready",
      value: j?.reportReady ?? null,
      percent: pct(j?.reportReady ?? 0, j?.reached ?? 0),
      caption: label(j?.reportReady ?? 0, j?.reached ?? 0, "exams"),
      colors: ["#0F877D", "#2EC4B3"],
      misses: j && j.waiting ? [{ n: j.waiting, title: "waiting for the report", note: j.waitingHeld ? `${j.waitingHeld} have a file we could not use` : undefined, tone: "slate", href: "/board?chip=waiting" }] : [],
    },
    {
      icon: Smartphone,
      title: "Phone confirmed",
      value: j?.phoneConfirmed ?? null,
      percent: pct(j?.phoneConfirmed ?? 0, j?.reportReady ?? 0),
      caption: label(j?.phoneConfirmed ?? 0, j?.reportReady ?? 0, "reports"),
      colors: ["#0EA5A4", "#34D399"],
      misses: [
        ...(j && j.noNumber ? [{ n: j.noNumber, title: "no phone number", note: "nothing to send to", tone: "amber" as Tone, href: "/board?chip=attention" }] : []),
        ...(j && j.badFormat ? [{ n: j.badFormat, title: "invalid number", note: "not a real number", tone: "orange" as Tone, href: "/board?chip=invalid_number" }] : []),
      ],
    },
    {
      icon: Send,
      title: "Sent to patient",
      value: j?.sent ?? null,
      percent: pct(j?.sent ?? 0, j?.phoneConfirmed ?? 0),
      caption: label(j?.sent ?? 0, j?.phoneConfirmed ?? 0, "confirmed"),
      colors: ["#059669", "#34D399"],
      misses: [
        ...(j && j.failed ? [{ n: j.failed, title: "couldn't be sent", note: "will need a retry", tone: "rose" as Tone, href: "/board?chip=failed" }] : []),
        ...(j && j.refused ? [{ n: j.refused, title: "invalid number", note: "WhatsApp doesn't know it", tone: "orange" as Tone, href: "/board?chip=invalid_number" }] : []),
        ...(j && j.queued ? [{ n: j.queued, title: "about to be sent", tone: "sky" as Tone, href: "/board?chip=pending" }] : []),
      ],
    },
  ];
  // the time it takes to get from each step to the next (the first one needs a time from the imaging system)
  const between = [null, null, t?.fileToReadySeconds ?? null, null, t?.readyToSentSeconds ?? null];

  return (
    <section className="rounded-2xl bg-white shadow-lg shadow-ink-900/10 ring-1 ring-slate-200/70">
      <header className="px-5 pb-1 pt-4">
        <h2 className="font-semibold">The journey of an exam</h2>
        <p className="text-xs text-slate-500">From the scan to the patient&apos;s WhatsApp. The numbers under “Not here yet” open the matching list on the Board.</p>
      </header>
      <div className="flex flex-col gap-3 px-5 pb-5 pt-3 lg:flex-row lg:items-stretch lg:gap-0">
        {steps.map((s, i) => (
          <div key={s.title} className="contents">
            {i > 0 && (
              <div className="hidden w-[64px] shrink-0 flex-col items-center pt-[44px] lg:flex xl:w-[74px]">
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-slate-700 shadow-md ring-1 ring-slate-200">{between[i] === null ? "—" : formatSeconds(between[i])}</span>
                <svg width="64" height="20" viewBox="0 0 74 20" className="-mt-1.5">
                  <line x1="6" y1="10" x2="60" y2="10" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" />
                  <line x1="6" y1="10" x2="60" y2="10" stroke={s.colors[0]} strokeWidth="3" className="flow-dots" />
                  <path d="M56 4l8 6-8 6" fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            <div className="min-w-0 flex-1 rounded-2xl bg-white p-4 shadow-lg shadow-ink-900/5 ring-1 ring-slate-200/80 transition hover:-translate-y-0.5">
              <div className="h-1 rounded-full" style={{ background: `linear-gradient(90deg,${s.colors[0]},${s.colors[1]})` }} />
              <p className="mt-3 flex items-center gap-2 text-[13px] font-bold" style={{ color: s.colors[0] }}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow" style={{ background: `linear-gradient(135deg,${s.colors[0]},${s.colors[1]})` }}>
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">{s.title}</span>
              </p>
              <div className="relative mx-auto mt-2.5 flex h-[88px] w-[88px] items-center justify-center">
                <svg viewBox="0 0 112 112" className="h-[88px] w-[88px] -rotate-90">
                  <defs>
                    <linearGradient id={`ring-${i}`} x1="0" x2="1">
                      <stop offset="0" stopColor={s.colors[0]} />
                      <stop offset="1" stopColor={s.colors[1]} />
                    </linearGradient>
                  </defs>
                  <circle cx="56" cy="56" r={R} fill="none" stroke="#EEF2F7" strokeWidth="11" />
                  <circle cx="56" cy="56" r={R} fill="none" stroke={`url(#ring-${i})`} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(s.percent / 100) * LEN} ${LEN}`} style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1)" }} />
                </svg>
                <span className="absolute text-[26px] font-extrabold tabular-nums">{s.value === null ? "—" : s.value}</span>
              </div>
              <p className="mt-1.5 text-center text-xs font-medium text-slate-500">{s.caption}</p>
              <div className="mt-3 min-h-[20px] space-y-1.5 border-t border-dashed border-slate-200 pt-2.5">
                {i === 0 ? (
                  <p className="text-center text-[11px] font-semibold text-slate-400">Where every exam starts</p>
                ) : (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Not here yet</p>
                    {s.misses.length === 0 && <p className="text-[11px] text-slate-400">Nothing — all clear</p>}
                    {s.misses.map((m) => {
                      const body = (
                        <>
                          <span className="flex items-start gap-1.5 text-[11.5px] font-bold leading-tight">
                            <span className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1 text-[11px] tabular-nums text-white ${DOT[m.tone]}`}>{m.n}</span>
                            <span className="pt-px">{m.title}</span>
                          </span>
                          {m.note && <span className="mt-0.5 block pl-6 text-[10.5px] font-medium leading-snug opacity-80">{m.note}</span>}
                        </>
                      );
                      const cls = `block rounded-lg px-2 py-1.5 ring-1 ring-inset ${CHIP[m.tone]}`;
                      return m.href ? (
                        <Link key={m.title + m.n} href={m.href} className={`${cls} transition hover:-translate-y-0.5 hover:shadow-md`}>
                          {body}
                        </Link>
                      ) : (
                        <div key={m.title + m.n} className={cls}>
                          {body}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

