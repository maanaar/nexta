// The numbers behind the follow-up report, and the report page itself (templates/follow-up.html filled in).
//
// A "day" here is a study date (YYYY-MM-DD). Section 1 of the report is the day 7 days before the day it is
// sent (so the reports had time to be written); section 2 is yesterday, as a short preview.
import fs from "fs";
import path from "path";
import { containsMode, getConfig, type Config } from "@/lib/config";
import { formatLongDate, formatWhen } from "@/lib/format";
import { stmt } from "@/lib/nexta-db";
import { etiamCounts, healthSnapshot } from "@/lib/overview";

export const REPORT_DAYS_BACK = 7;

const pad = (n: number) => String(n).padStart(2, "0");
/** YYYY-MM-DD in local time */
export const localDay = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The day `n` days before (or after, when negative) a YYYY-MM-DD day. */
export function daysBefore(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d - n));
}

export type DayNumbers = {
  day: string;
  /** Print jobs the imaging system holds for the day (null when it can't be read) */
  etiam: number | null;
  pulled: number;
  /** In the imaging system but never pulled into Nexta */
  notReceived: number | null;
  waiting: number;
  noPhone: number;
  /** Pulled, but ETIAM has no usable accession number for it */
  noAccession: number;
  invalid: number;
  failed: number;
  /** A report and a number, waiting to be sent (or being sent) */
  ready: number;
  sent: number;
  byType: { type: string; pulled: number; sent: number; waiting: number; needsPerson: number }[];
};

/** How the cases of one study day stand: every pulled case is counted once, in the step it is at. */
export function dayNumbers(day: string): DayNumbers {
  const rows = stmt("SELECT state, modality FROM jobs WHERE study_date = ?").all(day) as { state: string; modality: string }[];
  const out: DayNumbers = { day, etiam: null, pulled: rows.length, notReceived: null, waiting: 0, noPhone: 0, noAccession: 0, invalid: 0, failed: 0, ready: 0, sent: 0, byType: [] };
  const types = new Map<string, DayNumbers["byType"][number]>();
  for (const r of rows) {
    const type = r.modality && r.modality !== "N/A" ? r.modality : "Other";
    const t = types.get(type) ?? { type, pulled: 0, sent: 0, waiting: 0, needsPerson: 0 };
    types.set(type, t);
    t.pulled++;
    switch (r.state) {
      case "waiting": out.waiting++; t.waiting++; break;
      case "no_number": out.noPhone++; t.needsPerson++; break;
      case "no_accession": out.noAccession++; t.needsPerson++; break;
      case "invalid_number": out.invalid++; t.needsPerson++; break;
      case "failed": out.failed++; t.needsPerson++; break;
      case "done": out.sent++; t.sent++; break;
      default: out.ready++; // send, sending
    }
  }
  out.byType = [...types.values()].sort((a, b) => b.pulled - a.pulled);
  const etiam = etiamCounts({ from: day, to: day });
  if (etiam.available) {
    out.etiam = Math.max(etiam.total, out.pulled);
    out.notReceived = Math.max(0, out.etiam - out.pulled);
  }
  return out;
}

export type Tone = "ok" | "warn" | "bad";
export type StatusLine = { label: string; value: string; detail?: string; tone: Tone };

export type FollowUpData = { today: string; main: DayNumbers; yesterday: DayNumbers; status: StatusLine[] };

/** What the report is looking for a report by: "Accession number · the file name contains it". */
export function foundByText(cfg: Pick<Config, "pdfName" | "pdfMatch">): { value: string; detail: string } {
  const p = cfg.pdfName;
  const what =
    p === "{accession}" ? "Accession number" : p === "{patientid}" ? "Patient ID" : p === "{name}" ? "Patient name" : p.includes("{jobuid") ? "ETIAM job ID" : `File name pattern ${p}`;
  return { value: what, detail: containsMode(cfg) ? "the file name contains it" : "the file name must be exactly it" };
}

/** How the system is doing right now, for the bottom of the report. */
async function systemStatus(): Promise<StatusLine[]> {
  const cfg = getConfig();
  const h = await healthSnapshot(false);
  const lines: StatusLine[] = [];

  lines.push({
    label: "Imaging system",
    value: h.imaging.ok ? "Connected" : "Can't be read right now",
    detail: h.imaging.ok ? `last looked ${formatWhen(h.imaging.lastSyncAt)}` : h.imaging.error ?? undefined,
    tone: h.imaging.ok ? "ok" : "bad",
  });

  lines.push({
    label: "Patient phone numbers",
    value: h.phones.ok ? "Coming in from the hospital system" : "The hospital system can't be read",
    detail: h.phones.ok ? `last one ${formatWhen(h.phones.lastMessageAt)} · ${h.phones.typedToday} typed by hand today` : h.phones.error ?? undefined,
    tone: h.phones.ok ? "ok" : "warn",
  });

  const s = h.sending;
  let mode: string;
  if (!h.whatsapp.configured) mode = "Not set up";
  else if (s.pausedUntil) mode = "Paused for now";
  else if (s.auto && s.dryRun) mode = "Automatic sending (test mode: nothing is really sent)";
  else if (s.auto) mode = "Automatic sending";
  else mode = "Manual sending only";
  lines.push({
    label: "WhatsApp",
    value: mode,
    detail: h.whatsapp.configured && s.auto ? (s.startDate ? `from ${s.startDate}, waits ${s.delaySeconds} s after the last change` : undefined) : h.whatsapp.configured ? "nothing goes out until someone presses Send" : undefined,
    tone: !h.whatsapp.configured ? "bad" : s.pausedUntil || (s.auto && s.dryRun) ? "warn" : "ok",
  });

  const inc = h.folders.incoming;
  if (inc.set) {
    lines.push({ label: "Reports arrive in", value: inc.path, detail: inc.exists ? undefined : "this folder can't be found", tone: inc.exists ? "ok" : "bad" });
  }
  const prep = h.folders.prepared;
  lines.push({
    label: inc.set ? "Prepared reports in" : "Reports are read from",
    value: prep.set ? prep.path : "No folder set",
    detail: prep.exists ? `last report arrived ${formatWhen(prep.lastFileAt)}` : prep.set ? "this folder can't be found" : undefined,
    tone: prep.exists ? "ok" : "bad",
  });

  const found = foundByText(cfg);
  lines.push({ label: "A case finds its report by", value: found.value, detail: found.detail, tone: "ok" });
  return lines;
}

/** The two days of the report sent on `today`, and how the system is doing. */
export async function followUpData(today: string = localDay()): Promise<FollowUpData> {
  return { today, main: dayNumbers(daysBefore(today, REPORT_DAYS_BACK)), yesterday: dayNumbers(daysBefore(today, 1)), status: await systemStatus() };
}

const MODALITY_NAMES: Record<string, string> = {
  CR: "CR · X-ray", DX: "DX · Digital X-ray", CT: "CT · CT scan", MR: "MR · MRI", US: "US · Ultrasound", MG: "MG · Mammography",
  NM: "NM · Nuclear medicine", PT: "PT · PET", XA: "XA · Angiography", RF: "RF · Fluoroscopy", OT: "Other",
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** "Sunday 11 October 2026" */
const longDay = (day: string) => formatLongDate(day).replace(/^(\w+), /, "$1 ");

const pctOf =(n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

function bar(n: DayNumbers): string {
  if (n.pulled === 0) return "";
  const seg = (count: number, color: string, title: string) =>
    count ? `<div style="width:${((count / n.pulled) * 100).toFixed(2)}%;background:${color}" title="${esc(title)} ${count}"></div>` : "";
  return [
    seg(n.ready, "#0EA5E9", "Ready"),
    seg(n.sent, "#10B981", "Sent"),
    seg(n.invalid, "#F97316", "Invalid number"),
    seg(n.noPhone, "#F59E0B", "No phone number"),
    seg(n.noAccession, "#BE123C", "No accession number"),
    seg(n.failed, "#F43F5E", "Failed"),
    seg(n.waiting, "#94A3B8", "Waiting for report"),
  ].join("");
}

function typeRows(n: DayNumbers): string {
  if (n.byType.length === 0) return `<tr><td colspan="5" style="text-align:center;color:#94A3B8">No cases that day</td></tr>`;
  return n.byType
    .map((t) => `<tr><td>${esc(MODALITY_NAMES[t.type] ?? t.type)}</td><td>${t.pulled}</td><td>${t.sent}</td><td>${t.waiting}</td><td>${t.needsPerson}</td></tr>`)
    .join("");
}

const TEMPLATE_FILE = path.join(process.cwd(), "templates", "follow-up.html");

const DOT: Record<Tone, string> = { ok: "#10B981", warn: "#F59E0B", bad: "#F43F5E" };

function statusRows(lines: StatusLine[]): string {
  return lines
    .map(
      (l) =>
        `<div class="st"><i style="background:${DOT[l.tone]}"></i><div><div class="stl">${esc(l.label)}</div><div class="stv">${esc(l.value)}</div>${l.detail ? `<div class="std">${esc(l.detail)}</div>` : ""}</div></div>`
    )
    .join("");
}

/** The report page for one person: every {{value}} is escaped, every {{{value}}} is ready-made HTML. */
export function renderReportHtml(data: FollowUpData, site: string, recipient: string, now: Date = new Date()): string {
  const m = data.main;
  const y = data.yesterday;
  const stamp = `${longDay(localDay(now))}, ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  const values: Record<string, string | number> = {
    site: site || "Nexta",
    recipient,
    sent_at: stamp,
    generated_at: stamp,
    d7_label: longDay(m.day),
    d7_etiam: m.etiam ?? "—",
    d7_pulled: m.pulled,
    d7_not_received_text: m.notReceived ? `${m.notReceived} never arrived` : "all arrived",
    d7_sent: m.sent,
    d7_sent_pct: pctOf(m.sent, m.pulled),
    d7_waiting: m.waiting,
    d7_ready: m.ready,
    d7_no_phone: m.noPhone,
    d7_no_accession: m.noAccession,
    d7_invalid: m.invalid,
    d7_failed: m.failed,
    y_label: longDay(y.day),
    y_etiam: y.etiam ?? "—",
    y_pulled: y.pulled,
    y_no_phone: y.noPhone,
    y_ready: y.ready,
    y_sent: y.sent,
    y_rest: Math.max(0, y.pulled - y.noPhone - y.ready - y.sent),
  };
  const raw: Record<string, string> = { d7_bar: bar(m), d7_type_rows: typeRows(m), status_rows: statusRows(data.status) };

  const template = fs.readFileSync(TEMPLATE_FILE, "utf8");
  return template
    .replace(/\{\{\{(\w+)\}\}\}/g, (_all, key: string) => raw[key] ?? "")
    .replace(/\{\{(\w+)\}\}/g, (_all, key: string) => esc(values[key] ?? ""));
}
