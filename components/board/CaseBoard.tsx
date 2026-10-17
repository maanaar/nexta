"use client";

import { useState } from "react";
import { CheckCircle2, PhoneOff, XCircle } from "lucide-react";
import { formatMinutes } from "@/lib/format";
import type { PatientRecord } from "@/lib/patient-data";
import { getStateKey, STATES, type StateKey } from "@/lib/patient-states";
import { Avatar } from "@/components/ui";
import { waitMinutes, waitTone } from "./shared";

type Props = {
  list: PatientRecord[];
  now: number;
  movingIds: Set<number>;
  onOpen: (id: number, focusPhone?: boolean) => void;
  onMove: (p: PatientRecord, target: StateKey) => void;
  onSaveNumber: (id: number, raw: string) => Promise<boolean>;
};

const COLUMNS: { key: StateKey; hint: string }[] = [
  { key: "waiting", hint: "Moves on by itself when the PDF lands" },
  { key: "no_number", hint: "Add a number to move it to Ready" },
  { key: "pending", hint: "Waiting for the WhatsApp sender" },
  { key: "sending", hint: "Being sent now. Moves on by itself" },
];

/** Why a card can't be dropped on a status, or null when it can. The server checks the same rules. */
function blockedReason(p: PatientRecord, target: StateKey): string | null {
  const key = getStateKey(p.state);
  const hasNumber = p.whatsappNum !== "N/A";
  if (key === target) return "Already here";
  if (target === "waiting" || target === "sending") return "Set automatically";
  if (key === "sending") return "Being sent right now";
  if ((target === "pending" || target === "no_number" || target === "invalid_number") && p.pdfs.length === 0) return "PDF hasn't been found yet";
  if (target === "pending" && !p.phoneValid) return "Needs a valid number";
  if (target === "no_number" && hasNumber) return "Has a number";
  if (target === "invalid_number" && !hasNumber) return "There is no number to mark";
  return null;
}

function Card({
  p,
  now,
  moving,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
  onSaveNumber,
}: {
  p: PatientRecord;
  now: number;
  moving: boolean;
  dragging: boolean;
  onOpen: Props["onOpen"];
  onDragStart: (p: PatientRecord) => void;
  onDragEnd: () => void;
  onSaveNumber: Props["onSaveNumber"];
}) {
  const key = getStateKey(p.state);
  const minutes = waitMinutes(p, now);
  const [number, setNumber] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={key !== "sending"}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(p.id));
        e.dataTransfer.effectAllowed = "move";
        onDragStart(p);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(p.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(p.id)}
      className={`shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20 ${
        key === "sending" ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      } ${dragging ? "opacity-40" : ""} ${moving ? "animate-pulse" : ""}`}
    >
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          <Avatar name={p.patientName} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-semibold text-ink-900">{p.patientName}</p>
              {p.modality !== "N/A" && <span className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{p.modality}</span>}
            </div>
            <p className="truncate text-xs text-slate-500">{p.studyDesc}</p>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="font-mono"># {p.accessionNum}</span>
          <span className="rounded-md bg-slate-50 px-1.5 py-0.5 font-mono font-semibold">{formatMinutes(minutes)}</span>
        </div>
        {key === "no_number" && (
          <form
            className="mt-2.5 flex gap-1.5"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const ok = await onSaveNumber(p.id, number);
              setSaving(false);
              if (ok) setNumber("");
            }}
          >
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="01001234567"
              inputMode="tel"
              className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm outline-none focus:border-teal-400 focus:bg-white"
            />
            <button disabled={saving || !number.trim()} className="h-8 rounded-lg bg-teal-500 px-3 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-50">
              Save
            </button>
          </form>
        )}
      </div>
      <div className="h-1 bg-slate-100">
        <div className={`h-1 ${waitTone(minutes)}`} style={{ width: `${Math.min(100, minutes / 1.2)}%` }} />
      </div>
    </div>
  );
}

export default function CaseBoard({ list, now, movingIds, onOpen, onMove, onSaveNumber }: Props) {
  const [dragged, setDragged] = useState<PatientRecord | null>(null);
  const [over, setOver] = useState<StateKey | null>(null);
  const endDrag = () => {
    setDragged(null);
    setOver(null);
  };
  const of = (key: StateKey) => list.filter((p) => getStateKey(p.state) === key);
  const hasSending = of("sending").length > 0;
  const columns = COLUMNS.filter((c) => c.key !== "sending" || hasSending);

  const dropProps = (key: StateKey) => {
    const reason = dragged ? blockedReason(dragged, key) : null;
    const canDrop = !!dragged && !reason;
    return {
      reason,
      canDrop,
      isOver: canDrop && over === key,
      handlers: {
        onDragOver: (e: React.DragEvent) => {
          if (!canDrop) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (over !== key) setOver(key);
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          if (dragged && canDrop) onMove(dragged, key);
          endDrag();
        },
      },
    };
  };

  const people = (items: PatientRecord[]) =>
    items.length ? (
      <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
        {items.slice(0, 4).map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-2">
            <Avatar name={p.patientName} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{p.patientName}</span>
              <span className="block font-mono text-[11px] text-orange-600">{p.whatsappNum}</span>
            </span>
            <button type="button" onClick={() => onOpen(p.id, true)} className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-brand-600 ring-1 ring-brand-200 hover:bg-brand-50">
              Fix
            </button>
          </li>
        ))}
        {items.length > 4 && <li className="py-1.5 text-center text-xs text-slate-400">+ {items.length - 4} more</li>}
      </ul>
    ) : null;
  const faces = (items: PatientRecord[]) =>
    items.length ? (
      <div className="mt-2 flex -space-x-1 pl-1">
        {items.slice(0, 5).map((p) => (
          <button key={p.id} type="button" title={p.patientName} onClick={() => onOpen(p.id)} className="rounded-full ring-2 ring-white">
            <Avatar name={p.patientName} size="sm" />
          </button>
        ))}
      </div>
    ) : null;

  const outcome = (key: StateKey, icon: React.ReactNode, tone: string, extra: (items: PatientRecord[]) => React.ReactNode) => {
    const items = of(key);
    const drop = dropProps(key);
    return (
      <div
        {...drop.handlers}
        className={`rounded-2xl bg-white p-3 shadow-sm transition ${drop.canDrop ? (drop.isOver ? "ring-2 ring-brand-500 ring-offset-2" : "ring-2 ring-brand-300") : "ring-1 ring-slate-200/70"} ${
          dragged && !drop.canDrop ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
          <div className="flex-1">
            <p className="text-sm font-semibold">{STATES[key].label}</p>
            <p className="text-xs text-slate-500">{dragged ? (drop.canDrop ? `Drop to mark ${STATES[key].label.toLowerCase()}` : drop.reason) : `${items.length} in this period`}</p>
          </div>
          <span className="text-lg font-bold tabular-nums">{items.length}</span>
        </div>
        {!dragged && extra(items)}
      </div>
    );
  };

  return (
    <div className={`grid items-start gap-4 p-4 ${hasSending ? "lg:grid-cols-[repeat(4,minmax(0,1fr))_300px]" : "lg:grid-cols-[repeat(3,minmax(0,1fr))_300px]"}`}>
      {columns.map(({ key, hint }) => {
        const items = of(key).sort((a, b) => waitMinutes(b, now) - waitMinutes(a, now));
        const drop = dropProps(key);
        const isSource = !!dragged && getStateKey(dragged.state) === key;
        return (
          <section
            key={key}
            {...drop.handlers}
            className={`min-w-0 rounded-2xl border-t-4 ${STATES[key].accent} transition ${
              drop.isOver ? "bg-brand-50 ring-2 ring-brand-400" : drop.canDrop ? "bg-slate-50 ring-2 ring-brand-200" : "bg-slate-50 ring-1 ring-slate-200/70"
            } ${dragged && !drop.canDrop && !isSource ? "opacity-50" : ""}`}
          >
            <header className="px-3.5 pb-2 pt-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATES[key].dot}`} />
                  {STATES[key].label}
                </h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${STATES[key].badge}`}>{items.length}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{dragged && !isSource ? (drop.canDrop ? <b className="text-brand-700">Drop here</b> : drop.reason) : hint}</p>
            </header>
            <div className="scroll-thin flex max-h-[calc(100vh-20rem)] min-h-24 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">All clear</div>
              ) : (
                items.map((p) => (
                  <Card key={p.id} p={p} now={now} moving={movingIds.has(p.id)} dragging={dragged?.id === p.id} onOpen={onOpen} onDragStart={setDragged} onDragEnd={endDrag} onSaveNumber={onSaveNumber} />
                ))
              )}
            </div>
          </section>
        );
      })}

      <aside className="min-w-0 space-y-3">
        <p className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">Outcomes</p>
        {outcome("sent", <CheckCircle2 className="h-4 w-4" />, "bg-emerald-50 text-emerald-600", faces)}
        {outcome("failed", <XCircle className="h-4 w-4" />, "bg-rose-50 text-rose-600", faces)}
        {outcome("invalid_number", <PhoneOff className="h-4 w-4" />, "bg-orange-50 text-orange-600", people)}
      </aside>
    </div>
  );
}
