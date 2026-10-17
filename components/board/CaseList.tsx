"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Phone, PhoneOff, RotateCw, Search, Send } from "lucide-react";
import { formatMinutes, formatWhen } from "@/lib/format";
import type { PatientRecord } from "@/lib/patient-data";
import { getStateKey, STATES, type StateKey } from "@/lib/patient-states";
import { Avatar, StateBadge } from "@/components/ui";
import { modalityName, waitMinutes } from "./shared";

export type Group = "none" | "modality" | "state";

type Props = {
  list: PatientRecord[];
  group: Group;
  now: number;
  onOpen: (id: number, focusPhone?: boolean) => void;
  onFind: (accession: string) => void;
  onSend: (id: number) => void;
};

const STATE_ORDER_FOR_GROUPS: StateKey[] = ["no_number", "invalid_number", "failed", "waiting", "pending", "sending", "sent"];
const PAGE = 15;
const FIRST_IN_GROUP = 6;

function ActionButton({ p, onOpen, onFind, onSend }: Pick<Props, "onOpen" | "onFind" | "onSend"> & { p: PatientRecord }) {
  const key = getStateKey(p.state);
  const base = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold";
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  if (key === "waiting")
    return (
      <button type="button" onClick={stop(() => onFind(p.accessionNum))} className={`${base} text-brand-600 ring-1 ring-brand-200 hover:bg-brand-50`}>
        <Search className="h-3.5 w-3.5" />
        Look for the file
      </button>
    );
  if (key === "no_number")
    return (
      <button type="button" onClick={stop(() => onOpen(p.id, true))} className={`${base} bg-teal-500 text-white hover:bg-teal-600`}>
        <Phone className="h-3.5 w-3.5" />
        Add number
      </button>
    );
  if (key === "invalid_number")
    return (
      <button type="button" onClick={stop(() => onOpen(p.id, true))} className={`${base} bg-orange-500 text-white hover:bg-orange-600`}>
        <PhoneOff className="h-3.5 w-3.5" />
        Fix number
      </button>
    );
  if (key === "sending")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Sending…
      </span>
    );
  if (key === "pending" || key === "failed")
    return (
      <button type="button" onClick={stop(() => onSend(p.id))} className={`${base} bg-brand-600 text-white hover:bg-brand-500`}>
        {key === "failed" ? <RotateCw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
        {key === "failed" ? "Retry" : "Send now"}
      </button>
    );
  return (
    <button type="button" onClick={stop(() => onSend(p.id))} className={`${base} text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50`}>
      Send again
    </button>
  );
}

function Row({ p, now, ...actions }: Pick<Props, "now" | "onOpen" | "onFind" | "onSend"> & { p: PatientRecord }) {
  const key = getStateKey(p.state);
  const hasNumber = p.whatsappNum !== "N/A";
  return (
    <tr onClick={() => actions.onOpen(p.id)} className="cursor-pointer border-t border-slate-100 hover:bg-brand-50/60">
      <td className="py-3 pl-5 pr-3">
        <div className="flex items-center gap-3">
          <Avatar name={p.patientName} size="sm" />
          <div className="min-w-0">
            <p className="max-w-[220px] truncate font-semibold">{p.patientName}</p>
            <p className="text-xs text-slate-500">ID {p.patientId}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        {p.modality !== "N/A" && <span className="mr-1.5 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">{p.modality}</span>}
        <span className="text-slate-600">{p.studyDesc}</span>
      </td>
      <td className="px-3 py-3 font-mono text-xs text-slate-600">{p.accessionNum}</td>
      <td className={`whitespace-nowrap px-3 py-3 ${!hasNumber ? "font-medium text-amber-600" : key === "invalid_number" ? "text-orange-600" : "text-slate-600"}`}>
        {hasNumber ? p.whatsappNum : "Missing"}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatWhen(p.receivedAt)}</td>
      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-600">{formatMinutes(waitMinutes(p, now))}</td>
      <td className="px-3 py-3">
        <StateBadge state={p.state} />
        {p.changedAfterSent && <span className="mt-1 block text-[11px] font-medium text-amber-700">Changed after sent</span>}
      </td>
      <td className="py-3 pl-3 pr-5 text-right">
        <ActionButton p={p} {...actions} />
      </td>
    </tr>
  );
}

export default function CaseList({ list, group, now, onOpen, onFind, onSend }: Props) {
  const [shown, setShown] = useState(PAGE);
  // Groups start closed: just the headings and counts, until someone opens one
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [all, setAll] = useState<Record<string, boolean>>({});
  const actions = { now, onOpen, onFind, onSend };

  const groups =
    group === "modality"
      ? Object.entries(
          list.reduce<Record<string, PatientRecord[]>>((acc, p) => {
            (acc[p.modality] ??= []).push(p);
            return acc;
          }, {})
        )
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([code, items]) => ({ key: `m:${code}`, title: `${code} · ${modalityName(code)}`, dot: "bg-brand-500", items }))
      : group === "state"
        ? STATE_ORDER_FOR_GROUPS.map((state) => ({
            key: `s:${state}`,
            title: STATES[state].label,
            dot: STATES[state].dot,
            items: list.filter((p) => getStateKey(p.state) === state),
          })).filter((g) => g.items.length)
        : [];

  const empty = (
    <tr>
      <td colSpan={8} className="px-5 py-16 text-center text-slate-400">
        Nothing here. Try another filter.
      </td>
    </tr>
  );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2.5 pl-5 pr-3">Patient</th>
              <th className="px-3">Study</th>
              <th className="px-3">Accession</th>
              <th className="px-3">Phone</th>
              <th className="px-3">Received</th>
              <th className="px-3">Time since</th>
              <th className="px-3">Status</th>
              <th className="py-2.5 pl-3 pr-5" />
            </tr>
          </thead>
          <tbody>
            {group === "none"
              ? list.length === 0
                ? empty
                : list.slice(0, shown).map((p) => <Row key={p.id} p={p} {...actions} />)
              : groups.length === 0
                ? empty
                : groups.map((g) => {
                    const isOpen = !!open[g.key];
                    const items = all[g.key] ? g.items : g.items.slice(0, FIRST_IN_GROUP);
                    return (
                      <FragmentGroup key={g.key}>
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td colSpan={8} className="px-5 py-2">
                            <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))} className="flex w-full items-center gap-2.5 text-left">
                              <ChevronDown className={`h-4 w-4 text-slate-400 transition ${isOpen ? "" : "-rotate-90"}`} />
                              <span className={`h-2.5 w-2.5 rounded-full ${g.dot}`} />
                              <span className="font-semibold">{g.title}</span>
                              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{g.items.length}</span>
                            </button>
                          </td>
                        </tr>
                        {isOpen && items.map((p) => <Row key={p.id} p={p} {...actions} />)}
                        {isOpen && g.items.length > FIRST_IN_GROUP && !all[g.key] && (
                          <tr className="border-t border-slate-100">
                            <td colSpan={8} className="px-5 py-2 text-center">
                              <button type="button" onClick={() => setAll((a) => ({ ...a, [g.key]: true }))} className="text-xs font-semibold text-brand-600 hover:underline">
                                Show all {g.items.length}
                              </button>
                            </td>
                          </tr>
                        )}
                      </FragmentGroup>
                    );
                  })}
          </tbody>
        </table>
      </div>
      {group === "none" && list.length > shown && (
        <div className="border-t border-slate-100 p-3 text-center">
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="rounded-lg px-4 py-2 text-sm font-semibold text-brand-600 ring-1 ring-brand-200 hover:bg-brand-50">
            Show {PAGE} more · {list.length - shown} left
          </button>
        </div>
      )}
    </>
  );
}

// A group is several table rows; this keeps them together under one key
function FragmentGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
