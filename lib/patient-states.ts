// Single place that maps the many raw state strings (SQLite, Odoo, UI) to one
// label + colour scheme, so badges look the same on every screen.

export type StateKey =
  | "pending"
  | "sent"
  | "failed"
  | "no_number"
  | "no_whatsapp"
  | "signed_out"
  | "waiting";

export type StateMeta = {
  key: StateKey;
  label: string;
  badge: string;
  dot: string;
  accent: string;
  isIssue: boolean;
};

export const STATES: Record<StateKey, StateMeta> = {
  waiting: {
    key: "waiting",
    label: "Waiting for PDF",
    badge: "bg-slate-100 text-slate-600 ring-slate-500/20",
    dot: "bg-slate-400",
    accent: "border-t-slate-400",
    isIssue: false,
  },
  pending: {
    key: "pending",
    label: "Ready to send",
    badge: "bg-brand-50 text-brand-700 ring-brand-500/25",
    dot: "bg-brand-500",
    accent: "border-t-brand-500",
    isIssue: false,
  },
  sent: {
    key: "sent",
    label: "Sent",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-500/25",
    dot: "bg-emerald-500",
    accent: "border-t-emerald-500",
    isIssue: false,
  },
  failed: {
    key: "failed",
    label: "Failed",
    badge: "bg-rose-50 text-rose-700 ring-rose-500/25",
    dot: "bg-rose-500",
    accent: "border-t-rose-500",
    isIssue: true,
  },
  no_number: {
    key: "no_number",
    label: "No number",
    badge: "bg-amber-50 text-amber-700 ring-amber-500/30",
    dot: "bg-amber-500",
    accent: "border-t-amber-500",
    isIssue: true,
  },
  no_whatsapp: {
    key: "no_whatsapp",
    label: "No WhatsApp",
    badge: "bg-orange-50 text-orange-700 ring-orange-500/25",
    dot: "bg-orange-500",
    accent: "border-t-orange-500",
    isIssue: true,
  },
  signed_out: {
    key: "signed_out",
    label: "WhatsApp signed out",
    badge: "bg-violet-50 text-violet-700 ring-violet-500/25",
    dot: "bg-violet-500",
    accent: "border-t-violet-500",
    isIssue: true,
  },
};

export const STATE_ORDER: StateKey[] = [
  "waiting",
  "no_number",
  "pending",
  "sent",
  "failed",
  "no_whatsapp",
  "signed_out",
];

const aliases: Record<string, StateKey> = {
  pending: "pending",
  send: "pending",
  waitingtosend: "pending",
  waitingforreport: "pending",
  inprogress: "pending",
  sent: "sent",
  done: "sent",
  failed: "failed",
  nonumber: "no_number",
  nowhatsapp: "no_whatsapp",
  nowhatapp: "no_whatsapp",
  signedout: "signed_out",
  whatsappsignedout: "signed_out",
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
