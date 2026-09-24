// Nexta's own database. Holds everything ETIAM doesn't: phone numbers,
// delivery state and PDF paths. ETIAM's sqlite is only ever read.
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export type JobState =
  | "waiting" // print job seen, PDF not found yet
  | "send" // PDF + phone ready, waiting for the sender
  | "no_number" // PDF ready, no phone number
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
  pdf_path: string | null;
  whatsapp_num: string | null;
  phone_source: PhoneSource | null;
  state: JobState;
  first_seen: string;
  sent_at: string | null;
};

const DB_PATH = process.env.NEXTA_DB_PATH || path.join(process.cwd(), "data", "nexta.db");

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_uid       TEXT UNIQUE NOT NULL,
      patient_name  TEXT NOT NULL DEFAULT '',
      patient_id    TEXT NOT NULL DEFAULT '',
      accession     TEXT NOT NULL DEFAULT '',
      modality      TEXT NOT NULL DEFAULT '',
      study_desc    TEXT NOT NULL DEFAULT '',
      study_date    TEXT NOT NULL DEFAULT '',
      pdf_path      TEXT,
      whatsapp_num  TEXT,
      phone_source  TEXT,
      state         TEXT NOT NULL DEFAULT 'waiting',
      first_seen    TEXT NOT NULL,
      sent_at       TEXT
    );
    CREATE INDEX IF NOT EXISTS jobs_patient_id ON jobs(patient_id);
    CREATE INDEX IF NOT EXISTS jobs_accession ON jobs(accession);

    -- Phone numbers found in HL7 messages, keyed by 'pid:<id>' or 'acc:<accession>'
    CREATE TABLE IF NOT EXISTS hl7_phones (
      key         TEXT PRIMARY KEY,
      phone       TEXT NOT NULL,
      source_file TEXT NOT NULL,
      seen_at     TEXT NOT NULL
    );

    -- HL7 files already parsed, so each sync only reads new/changed files
    CREATE TABLE IF NOT EXISTS hl7_files (
      name  TEXT PRIMARY KEY,
      mtime INTEGER NOT NULL
    );
  `);
  return db;
}

const FINAL_STATES: JobState[] = ["done", "failed", "no_whatsapp", "signed_out"];

/** State a job should be in given its PDF + phone, unless the sender already settled it. */
export function deriveState(job: Pick<JobRow, "state" | "pdf_path" | "whatsapp_num">): JobState {
  if (FINAL_STATES.includes(job.state)) return job.state;
  if (!job.pdf_path) return "waiting";
  return job.whatsapp_num ? "send" : "no_number";
}

export function listJobs(limit = 2000): JobRow[] {
  return getDb()
    .prepare("SELECT * FROM jobs ORDER BY first_seen DESC, id DESC LIMIT ?")
    .all(limit) as JobRow[];
}

export function getJob(id: number): JobRow | undefined {
  return getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
}

/** Manual edit from the dashboard. Always wins over HL7, and re-queues the job. */
export function setManualPhone(id: number, phone: string): JobRow | undefined {
  const job = getJob(id);
  if (!job) return undefined;
  const whatsapp_num = phone || null;
  // A corrected number deserves another attempt, even after a failure
  const state: JobState = !job.pdf_path ? "waiting" : whatsapp_num ? "send" : "no_number";
  getDb()
    .prepare("UPDATE jobs SET whatsapp_num = ?, phone_source = ?, state = ?, sent_at = NULL WHERE id = ?")
    .run(whatsapp_num, whatsapp_num ? "manual" : null, state, id);
  return getJob(id);
}
