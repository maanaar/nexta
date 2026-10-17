// The numbers behind the Board and System health screens: what ETIAM has versus what Nexta received,
// the journey of an exam, timings, message counts, and a snapshot of whether everything is working.
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getConfig, usesAccession } from "@/lib/config";
import { checkWhatsApp } from "@/lib/config-checks";
import { syncIfStale } from "@/lib/etiam-sync";
import { compressStatus, findGhostscript } from "@/lib/pdf-compress";
import { containsKey, keysOf, stemOf } from "@/lib/pdf-match";
import { senderStatus } from "@/lib/sender";
import { stmt, type JobRow } from "@/lib/nexta-db";

export type Range = { from: string | null; to: string | null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** from / to (YYYY-MM-DD) and modality from a request's query string */
export function parseFilters(params: URLSearchParams): { range: Range; modality: string | null } {
  const day = (v: string | null) => (v && DAY.test(v) ? v : null);
  const modality = params.get("modality");
  return { range: { from: day(params.get("from")), to: day(params.get("to")) }, modality: modality && modality !== "All" ? modality : null };
}

/** SQL for "jobs with this study date and exam type" */
function jobsWhere(range: Range, modality?: string | null) {
  const where: string[] = [];
  const params: string[] = [];
  if (range.from) (where.push("study_date >= ?"), params.push(range.from));
  if (range.to) (where.push("study_date <= ?"), params.push(range.to));
  if (modality) (where.push("modality = ?"), params.push(modality));
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

// ---------------------------------------------------------------- what the imaging system has

/** How many print jobs ETIAM itself holds for these dates (read-only), so we can tell how many Nexta has not received. */
export function etiamCounts(range: Range, modality?: string | null) {
  try {
    const db = new Database(getConfig().etiamDbPath, { readonly: true, fileMustExist: true, timeout: 3000 });
    try {
      const where: string[] = [];
      const params: string[] = [];
      // ETIAM writes the study date as YYYYMMDD
      if (range.from) (where.push("replace(pjb_StudyDate,'-','') >= ?"), params.push(range.from.replace(/-/g, "")));
      if (range.to) (where.push("replace(pjb_StudyDate,'-','') <= ?"), params.push(range.to.replace(/-/g, "")));
      if (modality) (where.push("pjb_Modality = ?"), params.push(modality));
      // Print jobs without a real accession number are not pulled into Nexta (when reports are found by accession), so they are not counted either
      if (usesAccession()) where.push("trim(coalesce(pjb_AccessionNumber,'')) <> ''", "upper(trim(pjb_AccessionNumber)) NOT IN ('N/A','NA')", "trim(pjb_AccessionNumber,'xX') <> ''", "trim(pjb_AccessionNumber,'0') <> ''");
      const row = db
        .prepare(
          `SELECT COUNT(*) AS total, SUM(CASE WHEN trim(coalesce(pjb_JobUID,'')) = '' THEN 1 ELSE 0 END) AS noId
           FROM PrintJob ${where.length ? "WHERE " + where.join(" AND ") : ""}`
        )
        .get(...params) as { total: number; noId: number | null };
      return { available: true, total: row.total, noId: row.noId ?? 0 };
    } finally {
      db.close();
    }
  } catch {
    return { available: false, total: 0, noId: 0 };
  }
}

/** Received (in Nexta) against what ETIAM has, plus when the last exam and the last report arrived. */
export function boardOverview(range: Range, modality?: string | null) {
  const { sql, params } = jobsWhere(range, modality);
  const row = stmt(`SELECT COUNT(*) AS n, MAX(first_seen) AS lastReceivedAt, MAX(pdf_attached_at) AS lastReportAt FROM jobs ${sql}`).get(...params) as {
    n: number;
    lastReceivedAt: string | null;
    lastReportAt: string | null;
  };
  const etiam = etiamCounts(range, modality);
  return {
    received: row.n,
    etiam,
    // ETIAM clears old jobs, so this only means something for recent dates
    notReceived: etiam.available ? Math.max(0, etiam.total - row.n) : null,
    lastReceivedAt: row.lastReceivedAt,
    lastReportAt: row.lastReportAt,
  };
}

// ---------------------------------------------------------------- the journey of an exam, timings, messages

type StatRow = Pick<
  JobRow,
  "state" | "pdf_ref" | "bad_number" | "first_seen" | "pdf_attached_at" | "pdf_arrived_at" | "ready_at" | "sent_at" | "pdf_note"
>;

const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const secondsBetween = (later: string | null, earlier: string | null) => {
  if (!later || !earlier) return null;
  const s = (Date.parse(later) - Date.parse(earlier)) / 1000;
  return Number.isFinite(s) && s >= 0 ? s : null;
};
/** Seconds between a report file landing and Nexta picking it up; a file that sat there for over an hour (found at start-up) says nothing about speed. */
const pickupSeconds = (attached: string | null, arrived: string | null) => {
  const s = secondsBetween(attached, arrived);
  return s !== null && s <= 3600 ? s : null;
};
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function systemStats(range: Range, modality?: string | null) {
  const { sql, params } = jobsWhere(range, modality);
  const rows = stmt(
    `SELECT state, pdf_ref, bad_number, first_seen, pdf_attached_at, pdf_arrived_at, ready_at, sent_at, pdf_note FROM jobs ${sql}`
  ).all(...params) as StatRow[];
  const etiam = etiamCounts(range, modality);

  const is = (state: string) => rows.filter((r) => r.state === state).length;
  const reached = rows.length;
  const reportReady = rows.filter((r) => r.pdf_ref).length;
  const waiting = is("waiting");
  const held = rows.filter((r) => r.state === "waiting" && r.pdf_note).length;
  const noNumber = is("no_number");
  // A number that failed the format check, against one WhatsApp itself refused (it was tried)
  const badFormat = rows.filter((r) => r.state === "invalid_number" && !r.bad_number).length;
  const refused = rows.filter((r) => r.state === "invalid_number" && r.bad_number).length;
  const phoneConfirmed = reportReady - noNumber - badFormat;
  const sent = is("done");
  const failed = is("failed");
  const queued = is("send") + is("sending");

  const done = rows.filter((r) => r.state === "done");
  const timings = {
    // from the report file arriving in the folder to it being connected to its exam
    fileToReadySeconds: avg(rows.map((r) => pickupSeconds(r.pdf_attached_at, r.pdf_arrived_at)).filter((v): v is number => v !== null)),
    // from being ready (report + number) to being sent; includes the safety wait
    readyToSentSeconds: avg(done.map((r) => secondsBetween(r.sent_at, r.ready_at)).filter((v): v is number => v !== null)),
    // from reaching Nexta to being sent
    examToSentMinutes: ((v) => (v === null ? null : v / 60))(avg(done.map((r) => secondsBetween(r.sent_at, r.first_seen)).filter((v): v is number => v !== null))),
    // not measurable until ETIAM gives a time per job
    examToReachedSeconds: null as number | null,
  };

  // how long patients wait, by the hour their exam reached Nexta
  const byHour = Array.from({ length: 24 }, () => [] as number[]);
  for (const r of done) {
    const s = secondsBetween(r.sent_at, r.first_seen);
    if (s !== null) byHour[new Date(r.first_seen).getHours()].push(s / 60);
  }
  const waitByHour = byHour.map((list) => (list.length ? Math.round(avg(list)!) : null));

  return {
    journey: {
      // ETIAM clears old jobs, so it can hold fewer than Nexta already received
      examsInEtiam: etiam.available ? Math.max(etiam.total, reached) : null,
      reached,
      notReceived: etiam.available ? Math.max(0, etiam.total - reached) : null,
      reportReady,
      waiting,
      waitingHeld: held,
      phoneConfirmed,
      noNumber,
      badFormat,
      sent,
      failed,
      refused,
      queued,
    },
    timings,
    waitByHour,
    messages: messageCounts(range),
    daily: dailyMessages(7),
  };
}

type LogRow = { job_id: number; at: string; trigger: string; result: string };

/** Messages sent between two dates: by itself, by a person, and sent again (the same report, a second time). */
function messageCounts(range: Range) {
  const where: string[] = [];
  const params: string[] = [];
  if (range.from) (where.push("date(at,'localtime') >= ?"), params.push(range.from));
  if (range.to) (where.push("date(at,'localtime') <= ?"), params.push(range.to));
  const logs = stmt(`SELECT job_id, at, trigger, result FROM send_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY at`).all(...params) as LogRow[];
  const earlier = new Set(
    (stmt(`SELECT DISTINCT job_id FROM send_log WHERE result = 'done' ${range.from ? "AND date(at,'localtime') < ?" : "AND 0"}`).all(...(range.from ? [range.from] : [])) as { job_id: number }[]).map(
      (r) => r.job_id
    )
  );
  return tally(logs, earlier);
}

function tally(logs: LogRow[], earlier: Set<number>) {
  const out = { total: 0, auto: 0, manual: 0, again: 0, failed: 0 };
  for (const l of logs) {
    if (l.result === "failed") out.failed++;
    else if (l.result === "done") {
      out.total++;
      if (earlier.has(l.job_id)) out.again++;
      else if (l.trigger === "manual") out.manual++;
      else out.auto++;
      earlier.add(l.job_id);
    }
  }
  return out;
}

/** The last `days` days, oldest first, for the messages-per-day chart. */
function dailyMessages(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const since = start.toISOString();
  const logs = stmt("SELECT job_id, at, trigger, result FROM send_log WHERE at >= ? ORDER BY at").all(since) as LogRow[];
  const earlier = new Set((stmt("SELECT DISTINCT job_id FROM send_log WHERE result = 'done' AND at < ?").all(since) as { job_id: number }[]).map((r) => r.job_id));
  const byDay = new Map<string, LogRow[]>();
  for (const l of logs) {
    const k = dayKey(new Date(l.at));
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(l);
  }
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = dayKey(d);
    return { date: k, ...tally(byDay.get(k) ?? [], earlier) };
  });
}

// ---------------------------------------------------------------- is everything working?

export type Tone = "ok" | "warn" | "bad";

function folderState(dir: string) {
  if (!dir) return { path: "", set: false, exists: false };
  try {
    return { path: dir, set: true, exists: fs.statSync(dir).isDirectory() };
  } catch {
    return { path: dir, set: true, exists: false };
  }
}

/** A snapshot of the pipeline. `check` also asks Meta whether the WhatsApp login still works (a network call, so only on request). */
export async function healthSnapshot(check: boolean) {
  const cfg = getConfig();
  const sync = await syncIfStale();
  const last = (sql: string) => (stmt(sql).get() as { v: string | null }).v;
  const sender = senderStatus();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const whatsapp = check && (cfg.waPhoneNumberId || cfg.waToken || cfg.waTemplate) ? await checkWhatsApp(cfg.waPhoneNumberId, cfg.waToken, cfg.waTemplate) : null;
  const prepared = cfg.pdfInDir ? { enabled: true, found: findGhostscript(cfg.gsPath) !== null } : { enabled: false, found: false };
  const lastFiles = (stmt("SELECT pdf_arrived_at AS a, pdf_attached_at AS b FROM jobs WHERE pdf_arrived_at IS NOT NULL ORDER BY pdf_attached_at DESC LIMIT 10").all() as { a: string; b: string }[])
    .map((r) => pickupSeconds(r.b, r.a))
    .filter((v): v is number => v !== null);

  return {
    checkedAt: new Date().toISOString(),
    imaging: { ok: !sync.etiamError, error: sync.etiamError, lastSyncAt: sync.lastSync },
    phones: {
      ok: !sync.hl7Error,
      error: sync.hl7Error,
      lastMessageAt: last("SELECT MAX(seen_at) AS v FROM hl7_phones"),
      typedToday: (stmt("SELECT COUNT(*) AS n FROM jobs WHERE phone_source = 'manual' AND ready_at >= ?").get(startOfToday.toISOString()) as { n: number }).n,
    },
    whatsapp: {
      configured: !!(cfg.waPhoneNumberId && cfg.waToken && cfg.waTemplate),
      checked: check,
      ok: whatsapp ? whatsapp.ok : null,
      message: whatsapp?.message ?? null,
    },
    sending: {
      auto: cfg.autoSend,
      dryRun: cfg.waDryRun,
      delaySeconds: cfg.sendDelaySeconds,
      startDate: cfg.sendFromDate,
      pausedUntil: sender.pausedUntil > Date.now() ? new Date(sender.pausedUntil).toISOString() : null,
    },
    folders: {
      incoming: { ...folderState(cfg.pdfInDir), lastFileAt: null as string | null },
      prepared: { ...folderState(cfg.pdfDir), lastFileAt: last("SELECT MAX(pdf_arrived_at) AS v FROM jobs") },
    },
    preparation: { ...prepared, ...compressStatus(), fromDate: cfg.compressFromDate, lastSeconds: lastFiles.length ? Math.round(avg(lastFiles)!) : null },
    syncError: sync.syncError,
  };
}

// ---------------------------------------------------------------- finding a report file by hand

export type FoundFile = { name: string; createdAt: string; modifiedAt: string; size: number; heldReason: string | null };

function filesIn(dir: string, query: string): FoundFile[] | null {
  if (!dir) return null;
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => /\.pdf$/i.test(n) && containsKey(stemOf(n), query));
  } catch {
    return [];
  }
  const known = stmt("SELECT 1 FROM jobs WHERE pdf_key = ? COLLATE NOCASE LIMIT 1");
  const isKnown = (k: string) => known.get(k) !== undefined;
  const out: FoundFile[] = [];
  for (const name of names.slice(0, 20)) {
    try {
      const st = fs.statSync(path.join(dir, name));
      const keys = keysOf(stemOf(name), isKnown);
      out.push({
        name,
        createdAt: new Date(st.birthtimeMs || st.ctimeMs).toISOString(),
        modifiedAt: new Date(st.mtimeMs).toISOString(),
        size: st.size,
        heldReason: keys.length > 1 ? `This name holds ${keys.length} different numbers (${keys.join(", ")}), so it isn't matched to any of them.` : null,
      });
    } catch {
      // removed while listing
    }
  }
  return out;
}

/** Looks for an accession number or patient ID in the file names of both folders, and finds the case it belongs to. */
export function findFiles(rawQuery: string) {
  const query = rawQuery.trim();
  if (!query) return null;
  const cfg = getConfig();
  const cases = stmt(
    `SELECT id, patient_name, accession, patient_id, modality, study_desc, state FROM jobs
     WHERE accession = ? COLLATE NOCASE OR patient_id = ? COLLATE NOCASE ORDER BY first_seen DESC LIMIT 5`
  ).all(query, query) as Pick<JobRow, "id" | "patient_name" | "accession" | "patient_id" | "modality" | "study_desc" | "state">[];
  return {
    query,
    incoming: { path: cfg.pdfInDir, files: filesIn(cfg.pdfInDir, query) },
    prepared: { path: cfg.pdfDir, files: filesIn(cfg.pdfDir, query) },
    cases,
  };
}

/** Patients across every date, for the search box. */
export function searchJobs(rawQuery: string): JobRow[] {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_]/g, "")}%`;
  return stmt(
    `SELECT * FROM jobs WHERE patient_name LIKE ? OR accession LIKE ? OR patient_id LIKE ? OR whatsapp_num LIKE ?
     ORDER BY first_seen DESC LIMIT 8`
  ).all(like, like, like, like) as JobRow[];
}
