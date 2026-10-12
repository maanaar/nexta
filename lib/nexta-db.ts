// Nexta's own database. Keeps every ETIAM print job (even after ETIAM clears
// its list) plus what ETIAM doesn't store: phone numbers (from HL7 or typed in),
// where the job's PDF is, and delivery state.
// ETIAM's sqlite is only ever read.
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export type JobState =
  | "waiting" // print job received, PDF not available yet
  | "no_number" // print job received, no phone number yet
  | "send" // has a phone number, waiting for the sender
  | "done"
  | "failed"
  | "no_whatsapp"
  | "signed_out";

export type PhoneSource = "hl7" | "manual";

export type JobRow = {
  id: number;
  job_uid: string;
  patient_name: string;
  patient_id: string;
  accession: string;
  modality: string;
  study_desc: string;
  study_date: string;
  whatsapp_num: string | null;
  phone_source: PhoneSource | null;
  /** The PDF file name this job expects (without _2 / .pdf), from the PDF naming setting */
  pdf_key: string | null;
  /**
   * JSON list of where the job's PDFs are: "etiam:<column>" (stored in ETIAM's
   * PrintJob row) or "file:<path>" (one per file, e.g. 330930.pdf, 330930_2.pdf).
   * Null until found.
   */
  pdf_ref: string | null;
  state: JobState;
  first_seen: string;
  sent_at: string | null;
};

const DB_PATH = process.env.NEXTA_DB_PATH || path.join(process.cwd(), "data", "nexta.db");

let db: Database.Database | null = null;

const statements = new Map<string, Database.Statement>();

/** A prepared statement, compiled once and reused (syncs run the same SQL over and over). */
export function stmt(sql: string): Database.Statement {
  let statement = statements.get(sql);
  if (!statement) {
    statement = getDb().prepare(sql);
    statements.set(sql, statement);
  }
  return statement;
}

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id            INTEGER PRIMARY KEY,
      job_uid       TEXT UNIQUE NOT NULL,
      patient_name  TEXT NOT NULL DEFAULT '',
      patient_id    TEXT NOT NULL DEFAULT '',
      accession     TEXT NOT NULL DEFAULT '',
      modality      TEXT NOT NULL DEFAULT '',
      study_desc    TEXT NOT NULL DEFAULT '',
      study_date    TEXT NOT NULL DEFAULT '',
      whatsapp_num  TEXT,
      phone_source  TEXT,
      pdf_ref       TEXT,
      state         TEXT NOT NULL DEFAULT 'waiting',
      first_seen    TEXT NOT NULL,
      sent_at       TEXT
    );
    CREATE INDEX IF NOT EXISTS jobs_patient_id ON jobs(patient_id);
    CREATE INDEX IF NOT EXISTS jobs_accession ON jobs(accession);
    CREATE INDEX IF NOT EXISTS jobs_study_date ON jobs(study_date);
    CREATE INDEX IF NOT EXISTS jobs_first_seen ON jobs(first_seen);

    -- Phone numbers found in HL7 messages, keyed by 'pid:<id>' or 'acc:<accession>'
    CREATE TABLE IF NOT EXISTS hl7_phones (
      key         TEXT PRIMARY KEY,
      phone       TEXT NOT NULL,
      source_file TEXT NOT NULL,
      seen_at     TEXT NOT NULL
    );

    -- Server settings from the Settings page (see lib/config.ts)
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- HL7 files already parsed, so each sync only reads new/changed files
    CREATE TABLE IF NOT EXISTS hl7_files (
      name  TEXT PRIMARY KEY,
      mtime INTEGER NOT NULL
    );
  `);
  // Databases created before PDFs were tracked
  const columns = db.prepare("PRAGMA table_info(jobs)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "pdf_ref")) db.exec("ALTER TABLE jobs ADD COLUMN pdf_ref TEXT");
  if (!columns.some((c) => c.name === "pdf_key")) db.exec("ALTER TABLE jobs ADD COLUMN pdf_key TEXT");
  // File names are case-insensitive on Windows
  db.exec("CREATE INDEX IF NOT EXISTS jobs_pdf_key ON jobs(pdf_key COLLATE NOCASE)");
  return db;
}

/**
 * Accessions that are safe to match PDFs and HL7 phone numbers on. Placeholders
 * like "XXXX", "N/A" or "0000" are shared by many patients, and anything with
 * path characters could point outside the PDF folder.
 */
export function usableAccession(accession: string) {
  const a = accession.trim();
  return /^[A-Za-z0-9_.-]+$/.test(a) && !/^(x+|n\/?a|0+)$/i.test(a) && !a.includes("..");
}

/** The PDF sources in a job's pdf_ref (older databases stored a single plain value). */
export function pdfSources(pdf_ref: string | null): string[] {
  if (!pdf_ref) return [];
  if (!pdf_ref.startsWith("[")) return [pdf_ref];
  try {
    return JSON.parse(pdf_ref) as string[];
  } catch {
    return [];
  }
}

const FINAL_STATES: JobState[] = ["done", "failed", "no_whatsapp", "signed_out"];

/** State a job should be in given its PDF and phone number, unless the sender already settled it. */
export function deriveState(job: Pick<JobRow, "state" | "whatsapp_num" | "pdf_ref">): JobState {
  if (FINAL_STATES.includes(job.state)) return job.state;
  if (!job.pdf_ref) return "waiting";
  return job.whatsapp_num ? "send" : "no_number";
}

/**
 * PDF file names that would belong to more than one patient (e.g. two patients
 * with the same name, or a shared accession): never matched. Lower-cased.
 */
export function sharedPdfKeys(): Set<string> {
  const rows = stmt(
    `SELECT lower(pdf_key) AS k FROM jobs WHERE pdf_key IS NOT NULL
     GROUP BY lower(pdf_key) HAVING COUNT(DISTINCT patient_id) > 1`
  ).all() as { k: string }[];
  return new Set(rows.map((r) => r.k));
}

type PdfKeyFields = Pick<JobRow, "job_uid" | "accession" | "patient_id" | "patient_name">;

/**
 * The PDF file name a job expects under a naming pattern, e.g. "{accession}"
 * → "330930" (330930.pdf, 330930_2.pdf …). Null when a field it uses is empty
 * or a placeholder, or the result isn't a safe plain file name.
 */
export function pdfKeyFor(job: PdfKeyFields, pattern: string): string | null {
  const values: Record<string, string> = {
    "{accession}": job.accession.trim(),
    "{jobuid}": job.job_uid.trim().replace(/\./g, "-"),
    "{jobuid_raw}": job.job_uid.trim(),
    "{patientid}": job.patient_id.trim(),
    "{name}": job.patient_name.replace(/\^+/g, " ").replace(/\s+/g, " ").trim(),
  };
  let unusable = false;
  const key = pattern.replace(/\{[^}]*\}/g, (field) => {
    const value = values[field] ?? "";
    if (!value || /^(x+|n\/?a|0+|unknown)$/i.test(value)) unusable = true;
    return value;
  });
  // Letters (any script, for Arabic names), digits, space and a few safe symbols
  if (unusable || !/^[\p{L}\p{N} _.@-]+$/u.test(key) || key.includes("..")) return null;
  return key;
}

export type JobQuery = {
  /** Inclusive study-date range, "YYYY-MM-DD"; omit for no limit on that side */
  from?: string | null;
  to?: string | null;
  limit?: number;
};

/** Newest jobs first, filtered by study date in the database (uses jobs_study_date). */
export function listJobs({ from, to, limit = 2000 }: JobQuery = {}): { rows: JobRow[]; total: number } {
  const where: string[] = [];
  const params: string[] = [];
  if (from) {
    where.push("study_date >= ?");
    params.push(from);
  }
  if (to) {
    where.push("study_date <= ?");
    params.push(to);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = stmt(`SELECT * FROM jobs ${clause} ORDER BY first_seen DESC, id DESC LIMIT ?`).all(
    ...params,
    limit
  ) as JobRow[];
  // Only count when the page is full, so the usual small result costs one query
  const total =
    rows.length < limit
      ? rows.length
      : (stmt(`SELECT COUNT(*) AS n FROM jobs ${clause}`).get(...params) as { n: number }).n;
  return { rows, total };
}

/** Just these jobs, still limited to the date range (used after a live push). */
export function listJobsByIds(ids: number[], { from, to }: JobQuery = {}): JobRow[] {
  if (!ids.length) return [];
  const where = [`id IN (${ids.map(() => "?").join(",")})`];
  const params: (string | number)[] = [...ids];
  if (from) {
    where.push("study_date >= ?");
    params.push(from);
  }
  if (to) {
    where.push("study_date <= ?");
    params.push(to);
  }
  // Not cached: the number of ids varies per call
  return getDb()
    .prepare(`SELECT * FROM jobs WHERE ${where.join(" AND ")} ORDER BY first_seen DESC, id DESC`)
    .all(...params) as JobRow[];
}

export function getJob(id: number): JobRow | undefined {
  return stmt("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
}

/** Phone number entered on the dashboard. Wins over HL7, and re-queues the job even after a failed send. */
export function setManualPhone(id: number, phone: string): JobRow | undefined {
  const job = getJob(id);
  if (!job) return undefined;
  const whatsapp_num = phone || null;
  // A new number deserves another attempt, even after a failed send
  const state = deriveState({ state: "waiting", whatsapp_num, pdf_ref: job.pdf_ref });
  getDb()
    .prepare("UPDATE jobs SET whatsapp_num = ?, phone_source = ?, state = ?, sent_at = NULL WHERE id = ?")
    .run(whatsapp_num, whatsapp_num ? "manual" : null, state, id);
  return getJob(id);
}

export class StateChangeError extends Error {}

/**
 * Manual move on the organizer board. "Waiting for PDF", "No number" and
 * "Ready to send" follow the PDF and phone number, so they're only allowed when
 * those agree; the outcome states (sent, failed, …) can always be set by hand.
 */
export function setManualState(id: number, target: JobState): JobRow | undefined {
  const job = getJob(id);
  if (!job) return undefined;

  if (target === "waiting") {
    throw new StateChangeError("Waiting for PDF is set automatically until the PDF is found.");
  }
  if ((target === "send" || target === "no_number") && !job.pdf_ref) {
    throw new StateChangeError("The PDF for this job hasn't been found yet.");
  }
  if (target === "send" && !job.whatsapp_num) {
    throw new StateChangeError("Add a WhatsApp number first, then it can be sent.");
  }
  if (target === "no_number" && job.whatsapp_num) {
    throw new StateChangeError("This patient already has a WhatsApp number. Remove it on the patient page first.");
  }

  const sent_at = target === "done" ? (job.state === "done" && job.sent_at ? job.sent_at : new Date().toISOString()) : null;
  getDb().prepare("UPDATE jobs SET state = ?, sent_at = ? WHERE id = ?").run(target, sent_at, id);
  return getJob(id);
}
