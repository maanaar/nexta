// Single place that maps the many raw state strings (SQLite, Odoo, UI) to one
// label + colour scheme, so badges look the same on every screen.

export type StateKey = "waiting" | "no_accession" | "no_number" | "invalid_number" | "pending" | "sending" | "sent" | "failed";

export type StateMeta = {
  key: StateKey;
  /** Value stored in nexta.db (what the API expects when moving a card) */
  dbState: string;
  label: string;
  badge: string;
  dot: string;
  accent: string;
  /** Hex colour, for charts and bars */
  color: string;
  /** Needs a person to do something */
  isIssue: boolean;
};

export const STATES: Record<StateKey, StateMeta> = {
  waiting: {
    key: "waiting",
    dbState: "waiting",
    label: "Waiting for PDF",
    badge: "bg-slate-100 text-slate-600 ring-slate-500/20",
    dot: "bg-slate-400",
    accent: "border-t-slate-400",
    color: "#94A3B8",
    isIssue: false,
  },
  no_accession: {
    key: "no_accession",
    dbState: "no_accession",
    label: "No accession number",
    badge: "bg-rose-50 text-rose-700 ring-rose-500/30",
    dot: "bg-rose-500",
    accent: "border-t-rose-500",
    color: "#E11D48",
    isIssue: true,
  },
  no_number: {
    key: "no_number",
    dbState: "no_number",
    label: "No phone number",
    badge: "bg-amber-50 text-amber-700 ring-amber-500/30",
    dot: "bg-amber-500",
    accent: "border-t-amber-500",
    color: "#F59E0B",
    isIssue: true,
  },
  invalid_number: {
    key: "invalid_number",
    dbState: "invalid_number",
    label: "Invalid number",
    badge: "bg-orange-50 text-orange-700 ring-orange-500/25",
    dot: "bg-orange-500",
    accent: "border-t-orange-500",
    color: "#F97316",
    isIssue: true,
  },
  pending: {
    key: "pending",
    dbState: "send",
    label: "Ready to send",
    badge: "bg-brand-50 text-brand-700 ring-brand-500/25",
    dot: "bg-brand-500",
    accent: "border-t-brand-500",
    color: "#1F7AE0",
    isIssue: false,
  },
  sending: {
    key: "sending",
    dbState: "sending",
    label: "Sending",
    badge: "bg-sky-50 text-sky-700 ring-sky-500/25",
    dot: "bg-sky-500",
    accent: "border-t-sky-500",
    color: "#38BDF8",
    isIssue: false,
  },
  sent: {
    key: "sent",
    dbState: "done",
    label: "Sent",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-500/25",
    dot: "bg-emerald-500",
    accent: "border-t-emerald-500",
    color: "#10B981",
    isIssue: false,
  },
  failed: {
    key: "failed",
    dbState: "failed",
    label: "Failed",
    badge: "bg-rose-50 text-rose-700 ring-rose-500/25",
    dot: "bg-rose-500",
    accent: "border-t-rose-500",
    color: "#F43F5E",
    isIssue: true,
  },
};

/** Board columns, left to right. "Sending" is only drawn while a case is in it. */
export const WORK_COLUMNS: StateKey[] = ["waiting", "no_accession", "no_number", "pending", "sending"];
/** Where a case ends up: drop targets on the board. */
export const OUTCOMES: StateKey[] = ["sent", "failed", "invalid_number"];
export const STATE_ORDER: StateKey[] = [...WORK_COLUMNS, ...OUTCOMES];

const aliases: Record<string, StateKey> = {
  pending: "pending",
  send: "pending",
  waitingtosend: "pending",
  sending: "sending",
  sent: "sent",
  done: "sent",
  failed: "failed",
  nonumber: "no_number",
  noaccession: "no_accession",
  invalidnumber: "invalid_number",
  waiting: "waiting",
  nofile: "waiting",
  missing: "waiting",
};

export function getStateKey(raw?: string | null): StateKey {
  const normalized = (raw || "").toLowerCase().replace(/[^a-z]/g, "");
  return aliases[normalized] ?? "waiting";
}

export function getStateMeta(raw?: string | null): StateMeta {
  return STATES[getStateKey(raw)];
}
