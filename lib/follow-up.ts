// The follow-up schedule: who gets the follow-up report on WhatsApp, on which day of the week, and the
// sending of it. Uses the same Meta connection and phone number as the patient reports.
//
// Each morning (at the time in Server settings) every person scheduled for today's weekday gets the report
// as a PDF, once. A failed send is tried again every 10 minutes, up to 3 times that day.
import { getConfig, type Config } from "@/lib/config";
import { followUpData, localDay, renderReportHtml, type FollowUpData } from "@/lib/follow-up-report";
import { htmlToPdf } from "@/lib/html-pdf";
import { getDb, stmt } from "@/lib/nexta-db";
import { DEFAULT_COUNTRY_CODE, detectCountry, normalizePhone } from "@/lib/phone";
import { SendError, sendDocumentTemplate } from "@/lib/whatsapp";

export type Contact = { id: number; name: string; phone: string; dayOfWeek: number };
export type ContactRow = Contact & { lastSentAt: string | null; lastResult: "done" | "failed" | "dry_run" | null; lastError: string | null };

const RETRY_EVERY_MS = 10 * 60_000;
const MAX_ATTEMPTS_PER_DAY = 3;
const CHECK_EVERY_MS = 60_000;

type DbContact = { id: number; name: string; phone: string; day_of_week: number };
type LogRow = { at: string; result: "done" | "failed" | "dry_run"; error: string | null };

export function listContacts(): ContactRow[] {
  const rows = stmt("SELECT id, name, phone, day_of_week FROM follow_up_contacts ORDER BY day_of_week, id").all() as DbContact[];
  const last = stmt("SELECT at, result, error FROM follow_up_log WHERE contact_id = ? ORDER BY id DESC LIMIT 1");
  return rows.map((r) => {
    const l = last.get(r.id) as LogRow | undefined;
    return { id: r.id, name: r.name, phone: r.phone, dayOfWeek: r.day_of_week, lastSentAt: l?.at ?? null, lastResult: l?.result ?? null, lastError: l?.error ?? null };
  });
}

export type ContactInput = { id?: number | null; name: string; phone: string; dayOfWeek: number };

/**
 * Saves the whole schedule as it is on screen: lines are added, changed or removed to match. A completely
 * empty line is ignored. Returns an error message (nothing is saved) when a line isn't usable.
 */
export function saveContacts(input: ContactInput[]): { ok: true } | { ok: false; error: string } {
  const lines: { id: number | null; name: string; phone: string; day: number }[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const name = (c.name ?? "").trim();
    const raw = (c.phone ?? "").trim();
    if (!name && !raw) continue;
    const where = `Line ${i + 1}`;
    if (!name) return { ok: false, error: `${where}: enter a name` };
    const day = Number(c.dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) return { ok: false, error: `${where}: choose a day of the week` };
    const number = normalizePhone(raw, detectCountry(raw) ?? DEFAULT_COUNTRY_CODE);
    if (!number.ok) return { ok: false, error: `${where} (${name}): ${number.error}` };
    lines.push({ id: c.id ? Number(c.id) : null, name, phone: number.stored, day });
  }

  const db = getDb();
  db.transaction(() => {
    const keep = new Set<number>();
    const update = db.prepare("UPDATE follow_up_contacts SET name = ?, phone = ?, day_of_week = ? WHERE id = ?");
    const insert = db.prepare("INSERT INTO follow_up_contacts (name, phone, day_of_week) VALUES (?, ?, ?)");
    for (const l of lines) {
      if (l.id && update.run(l.name, l.phone, l.day, l.id).changes > 0) keep.add(l.id);
      else keep.add(Number(insert.run(l.name, l.phone, l.day).lastInsertRowid));
    }
    for (const r of db.prepare("SELECT id FROM follow_up_contacts").all() as { id: number }[]) {
      if (!keep.has(r.id)) db.prepare("DELETE FROM follow_up_contacts WHERE id = ?").run(r.id);
    }
  })();
  return { ok: true };
}

const logAttempt = (c: DbContact, forDate: string, reportDay: string, trigger: "auto" | "manual", result: "done" | "failed" | "dry_run", messageId: string | null, error: string | null) =>
  stmt(
    `INSERT INTO follow_up_log (contact_id, contact_name, phone, for_date, report_day, at, trigger, result, message_id, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(c.id, c.name, c.phone, forDate, reportDay, new Date().toISOString(), trigger, result, messageId, error);

export type SendResult = { name: string; ok: boolean; dryRun?: boolean; error?: string };

/** Makes the report for one person and sends it. Never throws: the outcome is logged and returned. */
async function sendTo(c: DbContact, data: FollowUpData, trigger: "auto" | "manual", cfg: Config): Promise<SendResult> {
  const forDate = data.today;
  const reportDay = data.main.day;
  try {
    if (!cfg.waPhoneNumberId || !cfg.waToken) throw new SendError("WhatsApp isn't set up yet (phone number ID and token in Server settings).");
    if (!cfg.waTemplate) throw new SendError("Enter the WhatsApp template name in Server settings.");

    const pdf = await htmlToPdf(renderReportHtml(data, cfg.siteName, c.name));
    const site = cfg.siteName || "Nexta";
    const filename = `Follow-up_${site.replace(/[^\w.-]+/g, "_")}_${reportDay}.pdf`;
    const phone = c.phone.replace(/\D/g, "");

    if (cfg.waDryRun && trigger === "auto") {
      console.log(`[follow-up] dry run: would send ${filename} (${pdf.length} bytes) to +${phone} (${c.name})`);
      logAttempt(c, forDate, reportDay, trigger, "dry_run", null, null);
      return { name: c.name, ok: true, dryRun: true };
    }

    // The same template as the patient reports: the PDF is its document header
    const messageId = await sendDocumentTemplate(cfg, phone, cfg.waTemplate, pdf, filename);
    logAttempt(c, forDate, reportDay, trigger, "done", messageId, null);
    return { name: c.name, ok: true };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error(`Follow-up report to ${c.name} failed: ${message}`);
    logAttempt(c, forDate, reportDay, trigger, "failed", null, message);
    return { name: c.name, ok: false, error: message };
  }
}

const dueTodayRows = (today: string) => {
  const weekday = new Date().getDay();
  return stmt("SELECT id, name, phone, day_of_week FROM follow_up_contacts WHERE day_of_week = ? ORDER BY id").all(weekday) as DbContact[];
};

/** Sends today's report now: to one person (any day), or to everyone scheduled for today who hasn't had it yet. */
export async function sendFollowUpNow(contactId?: number): Promise<SendResult[]> {
  const cfg = getConfig();
  const today = localDay();
  const data = followUpData(today);
  let people: DbContact[];
  if (contactId) {
    const one = stmt("SELECT id, name, phone, day_of_week FROM follow_up_contacts WHERE id = ?").get(contactId) as DbContact | undefined;
    if (!one) return [{ name: "", ok: false, error: "That line no longer exists." }];
    people = [one];
  } else {
    const got = stmt("SELECT 1 FROM follow_up_log WHERE contact_id = ? AND for_date = ? AND result IN ('done','dry_run') LIMIT 1");
    people = dueTodayRows(today).filter((p) => !got.get(p.id, today));
  }
  const results: SendResult[] = [];
  for (const p of people) results.push(await sendTo(p, data, "manual", cfg));
  return results;
}

const g = globalThis as typeof globalThis & { __nextaFollowUp?: { started: boolean; busy: boolean } };
const state = (g.__nextaFollowUp ??= { started: false, busy: false });

/** One look at the schedule: sends what is due. Called every minute. */
export async function runFollowUpDue(now: Date = new Date()) {
  if (state.busy) return;
  const cfg = getConfig();
  if (!cfg.followUpAuto) return;
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (hhmm < cfg.followUpTime) return;

  state.busy = true;
  try {
    const today = localDay(now);
    const done = stmt("SELECT 1 FROM follow_up_log WHERE contact_id = ? AND for_date = ? AND result IN ('done','dry_run') LIMIT 1");
    const attempts = stmt("SELECT COUNT(*) AS n, MAX(at) AS last FROM follow_up_log WHERE contact_id = ? AND for_date = ? AND result = 'failed'");
    let data: FollowUpData | null = null;
    for (const p of dueTodayRows(today)) {
      if (done.get(p.id, today)) continue;
      const a = attempts.get(p.id, today) as { n: number; last: string | null };
      if (a.n >= MAX_ATTEMPTS_PER_DAY) continue;
      if (a.last && now.getTime() - Date.parse(a.last) < RETRY_EVERY_MS) continue;
      data ??= followUpData(today);
      await sendTo(p, data, "auto", cfg);
    }
  } finally {
    state.busy = false;
  }
}

/** Started once when the server boots (see instrumentation.ts). */
export function startFollowUp() {
  if (state.started) return;
  state.started = true;
  setInterval(() => void runFollowUpDue().catch((err) => console.error("Follow-up scheduler:", err)), CHECK_EVERY_MS);
}
