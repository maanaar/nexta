"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, FileSearch, Printer, Send } from "lucide-react";
import type { boardOverview } from "@/lib/overview";
import { formatMinutes, formatWhen } from "@/lib/format";
import type { PatientRecord } from "@/lib/patient-data";
import { getStateKey } from "@/lib/patient-states";
import { ShareBar, waitMinutes, type Chip } from "./shared";

export type SendingInfo = { auto: boolean; dryRun: boolean; pausedUntil: string | null };

type Props = {
  /** Cases in the chosen dates and exam type */
  list: PatientRecord[];
  overview: ReturnType<typeof boardOverview> | null;
  chip: Chip;
  onChip: (chip: Chip) => void;
  sending: SendingInfo | null;
  messagesToday: number | null;
  now: number;
};

function WhatsAppMark({ className = "h-4 w-4" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="https://cdn.simpleicons.org/whatsapp/25D366" alt="" className={className} onError={(e) => (e.currentTarget.style.display = "none")} />;
}

function Card({
  id,
  chip,
  onChip,
  icon: Icon,
  label,
  value,
  bar,
  children,
  tone,
}: {
  id: Chip;
  chip: Chip;
  onChip: (c: Chip) => void;
  icon: typeof Printer;
  label: string;
  value: React.ReactNode;
  bar: React.ReactNode;
  children: React.ReactNode;
  tone?: "attention";
}) {
  const active = chip === id;
  const attention = tone === "attention";
  return (
    <button
      type="button"
      onClick={() => onChip(id)}
      className={`rounded-2xl p-4 text-left shadow-lg shadow-ink-900/10 ring-1 transition hover:-translate-y-0.5 hover:shadow-xl ${
        active ? "bg-white shadow-xl ring-2 ring-brand-500" : attention ? "bg-rose-50 ring-rose-200" : "bg-white ring-slate-200/70"
      }`}
    >
      <p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${attention ? "text-rose-600" : "text-slate-500"}`}>
        <Icon className="h-4 w-4" />
        {label}
      </p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${attention ? "text-rose-700" : "text-ink-900"}`}>{value}</p>
      <div className="mt-3">{bar}</div>
      <div className={`mt-2 space-y-0.5 text-xs ${attention ? "text-rose-600/80" : "text-slate-500"}`}>{children}</div>
    </button>
  );
}

export default function StatusStrip({ list, overview, chip, onChip, sending, messagesToday, now }: Props) {
  const count = (state: string) => list.filter((p) => getStateKey(p.state) === state).length;
  const total = list.length;
  const share = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  // the most recent case in a state (when it reached Nexta), so a card says what just happened, not what is stuck
  const newest = (state: string) => {
    const times = list.filter((p) => getStateKey(p.state) === state).map((p) => Date.parse(p.receivedAt)).filter(Number.isFinite);
    return times.length ? formatWhen(Math.max(...times)) : "—";
  };
  const latest = (pick: (p: PatientRecord) => string | null) => {
    const times = list.map(pick).filter((v): v is string => !!v).map(Date.parse).filter(Number.isFinite);
    return times.length ? Math.max(...times) : null;
  };

  const waiting = count("waiting"), pending = count("pending"), sentN = count("sent"), sendingN = count("sending");
  const noNumber = count("no_number"), invalid = count("invalid_number"), failed = count("failed");
  const attention = noNumber + invalid + failed;
  const etiamTotal = overview?.etiam.available ? overview.etiam.total : null;
  const notReceived = overview?.notReceived ?? 0;

  // Sending status: automatic, manual only, or paused
  const mode = !sending
    ? null
    : sending.pausedUntil
      ? { title: "Paused", sub: "WhatsApp needs reconnecting", tone: "paused" as const }
      : sending.auto
        ? { title: sending.dryRun ? "Automatic (test)" : "Automatic", sub: `${sendingN} sending now${messagesToday !== null ? ` · ${messagesToday} messages today` : ""}`, tone: "auto" as const }
        : { title: "Manual only", sub: "Nothing goes out until someone presses Send", tone: "manual" as const };
  const modeStyle = {
    auto: { box: "bg-linear-to-br from-emerald-50 to-teal-50 ring-emerald-200", text: "text-emerald-700", track: "bg-emerald-100", fill: "w-2/3 bg-emerald-500 animate-pulse" },
    manual: { box: "bg-slate-50 ring-slate-200", text: "text-slate-600", track: "bg-slate-200", fill: "w-0" },
    paused: { box: "bg-amber-50 ring-amber-300", text: "text-amber-700", track: "bg-amber-100", fill: "w-1/3 bg-amber-500" },
  }[mode?.tone ?? "manual"];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Card
        id="all"
        chip={chip}
        onChip={onChip}
        icon={Printer}
        label="Received"
        value={
          <>
            {total}
            {etiamTotal !== null && <span className="text-lg font-semibold text-slate-400"> / {Math.max(etiamTotal, total)}</span>}
          </>
        }
        bar={<ShareBar percent={100} full className="bg-ink-700" />}
      >
        <p>
          {etiamTotal === null ? (
            "the imaging system can't be read right now"
          ) : notReceived > 0 ? (
            <>
              <b className="text-amber-600">{notReceived} not received yet</b> from the imaging system
            </>
          ) : (
            "everything the imaging system has was received"
          )}
        </p>
        <p>last received {formatWhen(latest((p) => p.receivedAt))}</p>
      </Card>

      <Card id="waiting" chip={chip} onChip={onChip} icon={FileSearch} label="Waiting for PDF" value={waiting} bar={<ShareBar percent={pct(waiting)} className="bg-slate-400" />}>
        <p>
          {share(waiting)}% of received · latest came in {newest("waiting")}
        </p>
        <p>last report arrived {formatWhen(latest((p) => p.reportAt))}</p>
      </Card>

      <Card id="pending" chip={chip} onChip={onChip} icon={Send} label="Ready to send" value={pending} bar={<ShareBar percent={pct(pending)} className="bg-brand-500" />}>
        <p>
          {share(pending)}% of received · latest came in {newest("pending")}
        </p>
      </Card>

      {/* The sender's status. Not a filter: it opens System health, where the details are. */}
      <div className={`relative rounded-2xl p-4 text-left shadow-lg shadow-emerald-900/10 ring-1 ${modeStyle.box}`}>
        <p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${modeStyle.text}`}>
          <WhatsAppMark />
          Sending
        </p>
        <p className={`mt-1 flex items-center gap-2 text-2xl font-bold leading-9 ${modeStyle.text}`}>
          {mode ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                {mode.tone === "auto" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${mode.tone === "auto" ? "bg-emerald-500" : mode.tone === "paused" ? "bg-amber-500" : "bg-slate-400"}`} />
              </span>
              {mode.title}
            </>
          ) : (
            "…"
          )}
        </p>
        <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${modeStyle.track}`}>
          <div className={`h-1.5 rounded-full ${modeStyle.fill}`} />
        </div>
        <p className={`mt-2 text-xs ${modeStyle.text} opacity-80`}>{mode?.sub ?? ""}</p>
        <Link href="/health" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline">
          System health <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <Card id="sent" chip={chip} onChip={onChip} icon={CheckCircle2} label="Sent" value={sentN} bar={<ShareBar percent={pct(sentN)} className="bg-emerald-500" />}>
        <p>{share(sentN)}% of received</p>
      </Card>

      <Card
        id="attention"
        chip={chip}
        onChip={onChip}
        icon={AlertTriangle}
        label="Needs attention"
        value={attention}
        tone="attention"
        bar={
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-rose-100">
            {[
              [noNumber, "bg-amber-500", "No phone number"],
              [invalid, "bg-orange-500", "Invalid number"],
              [failed, "bg-rose-500", "Failed"],
            ].map(([n, cls, title]) => (
              <div key={title as string} className={cls as string} title={`${title}: ${n}`} style={{ width: `${attention ? ((n as number) / attention) * 100 : 0}%` }} />
            ))}
          </div>
        }
      >
        <p>
          {noNumber} no phone number · {invalid} invalid · {failed} failed
        </p>
      </Card>
    </div>
  );
}
