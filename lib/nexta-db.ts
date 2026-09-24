// Nexta's own database. Keeps every ETIAM print job (even after ETIAM clears
// its list) plus what ETIAM doesn't store: phone numbers (from HL7 or typed in)
// and delivery state.
// ETIAM's sqlite is only ever read.
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export type JobState =
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
      state         TEXT NOT NULL DEFAULT 'no_number',
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
  // Jobs from the earlier PDF-based version that were still waiting on a file
  db.exec(`UPDATE jobs SET state = CASE WHEN whatsapp_num IS NULL THEN 'no_number' ELSE 'send' END WHERE state = 'waiting'`);
  return db;
}

const FINAL_STATES: JobState[] = ["done", "failed", "no_whatsapp", "signed_out"];

/** State a job should be in given its phone number, unless the sender already settled it. */
export function deriveState(job: Pick<JobRow, "state" | "whatsapp_num">): JobState {
  if (FINAL_STATES.includes(job.state)) return job.state;
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

/** Phone number entered on the dashboard. Wins over HL7, and re-queues the job even after a failed send. */
export function setManualPhone(id: number, phone: string): JobRow | undefined {
  const job = getJob(id);
  if (!job) return undefined;
  const whatsapp_num = phone || null;
  const state: JobState = whatsapp_num ? "send" : "no_number";
  getDb()
    .prepare("UPDATE jobs SET whatsapp_num = ?, phone_source = ?, state = ?, sent_at = NULL WHERE id = ?")
    .run(whatsapp_num, whatsapp_num ? "manual" : null, state, id);
  return getJob(id);
}
