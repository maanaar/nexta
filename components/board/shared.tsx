"use client";

import { useEffect, useState } from "react";
import type { PatientRecord } from "@/lib/patient-data";
import { getStateKey } from "@/lib/patient-states";

/** The current time, refreshed every minute, so "waiting 5 min" keeps counting without a reload. */
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Minutes a case has been waiting: until it was sent, or until now. */
export function waitMinutes(p: PatientRecord, now: number): number {
  const start = Date.parse(p.receivedAt);
  const end = getStateKey(p.state) === "sent" && p.sentAtIso ? Date.parse(p.sentAtIso) : now;
  return Number.isFinite(start) ? Math.max(0, (end - start) / 60000) : 0;
}

/** Plain names for the exam type codes. */
export const MODALITY_NAMES: Record<string, string> = {
  MR: "MRI",
  CT: "CT scan",
  CR: "X-ray",
  DX: "X-ray",
  US: "Ultrasound",
  MG: "Mammography",
  NM: "Nuclear medicine",
  XA: "Angiography",
  PT: "PET",
};
export const modalityName = (code: string) => MODALITY_NAMES[code] ?? code;

/** Colour of the thin age bar on a card, by how long it has waited. */
export function waitTone(minutes: number) {
  return minutes < 15 ? "bg-emerald-500" : minutes < 60 ? "bg-amber-500" : "bg-rose-500";
}

/** A thin bar showing how big a share of everything received a status holds. */
export function ShareBar({ percent, className, full }: { percent: number; className: string; full?: boolean }) {
  const width = full ? 100 : percent > 0 ? Math.max(percent, 2) : 0;
  return (
    <div className="h-1.5 rounded-full bg-slate-100">
      <div className={`h-1.5 rounded-full ${className}`} style={{ width: `${width}%` }} />
    </div>
  );
}

/** The filters on the status strip: each one is a card the user can click to narrow the list. */
export type Chip = "all" | "waiting" | "pending" | "sending" | "sent" | "attention" | "failed" | "invalid_number";

export const CHIP_TITLE: Record<Chip, string> = {
  all: "All cases",
  waiting: "Waiting for PDF",
  pending: "Ready to send",
  sending: "Sending",
  sent: "Sent",
  attention: "Needs attention",
  failed: "Failed",
  invalid_number: "Invalid number",
};

/** Chips that finish a case: shown as a plain list of the cases, not as board columns. */
export const OUTCOME_CHIPS: Chip[] = ["sent", "failed", "invalid_number"];

const ATTENTION_STATES = ["no_accession", "no_number", "invalid_number", "failed"];

export function matchesChip(p: PatientRecord, chip: Chip): boolean {
  const state = getStateKey(p.state);
  if (chip === "all") return true;
  if (chip === "attention") return ATTENTION_STATES.includes(state);
  return state === chip;
}

/** Which card a status belongs to (so the bar and groups can filter by clicking). */
export function chipOf(state: string): Chip {
  const key = getStateKey(state);
  return key === "waiting" || key === "pending" || key === "sending" || key === "sent" ? key : "attention";
}
