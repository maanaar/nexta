// Pulls ETIAM print jobs, PDFs and HL7 phone numbers into nexta.db.
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { deriveState, getDb, type JobRow } from "@/lib/nexta-db";

const ETIAM_DB_PATH = process.env.ETIAM_DB_PATH || "C:\\ProgramData\\Etiam\\DcmPRI\\StorePrint\\sqlite.db";
const PDF_DIR = process.env.PDF_DIR || "E:\\pdfsend\\processed";
const HL7_DIR = process.env.HL7_DIR || "E:\\pdfsend\\hl7";
const SYNC_INTERVAL_MS = 15_000;

export type SyncStatus = {
  lastSync: string | null;
  etiamError: string | null;
  hl7Error: string | null;
};

const status: SyncStatus = { lastSync: null, etiamError: null, hl7Error: null };
let lastRun = 0;
let running: Promise<void> | null = null;

/** Runs a sync unless one ran in the last few seconds. Safe to call on every request. */
export async function syncIfStale(): Promise<SyncStatus> {
  if (running) await running;
  else if (Date.now() - lastRun > SYNC_INTERVAL_MS) {
    running = Promise.resolve().then(runSync).finally(() => {
      lastRun = Date.now();
      running = null;
    });
    await running;
  }
  return status;
}

function runSync() {
  try {
    importHl7Phones();
    status.hl7Error = null;
  } catch (err: any) {
    status.hl7Error = err.message;
    console.error("HL7 import failed:", err);
  }

  try {
    importEtiamJobs();
    status.etiamError = null;
  } catch (err: any) {
    status.etiamError = err.message;
    console.error("ETIAM import failed:", err);
  }

  refreshJobs();
  status.lastSync = new Date().toISOString();
}

// ---------------------------------------------------------------- ETIAM

type PrintJobRow = {
  pjb_StudyDate: string | number | null;
  pjb_PatientsName: string | null;
  pjb_AccessionNumber: string | null;
  pjb_PatientID: string | null;
  pjb_Modality: string | null;
  pjb_StudyDescription: string | null;
  pjb_JobUID: string | null;
};

function importEtiamJobs() {
  const etiam = new Database(ETIAM_DB_PATH, { readonly: true, fileMustExist: true });
  let rows: PrintJobRow[];
  try {
    rows = etiam
      .prepare(
        `SELECT pjb_StudyDate, pjb_PatientsName, pjb_AccessionNumber, pjb_PatientID,
                pjb_Modality, pjb_StudyDescription, pjb_JobUID
         FROM PrintJob`
      )
      .all() as PrintJobRow[];
  } finally {
    etiam.close();
  }

  const insert = getDb().prepare(`
    INSERT INTO jobs (job_uid, patient_name, patient_id, accession, modality, study_desc, study_date, first_seen)
    VALUES (@job_uid, @patient_name, @patient_id, @accession, @modality, @study_desc, @study_date, @first_seen)
    ON CONFLICT(job_uid) DO UPDATE SET
      patient_name = excluded.patient_name,
      patient_id   = excluded.patient_id,
      accession    = excluded.accession,
      modality     = excluded.modality,
      study_desc   = excluded.study_desc,
      study_date   = excluded.study_date
  `);

  const now = new Date().toISOString();
  getDb().transaction(() => {
    for (const row of rows) {
      const jobUid = row.pjb_JobUID?.trim();
      if (!jobUid) continue;
      insert.run({
        job_uid: jobUid,
        patient_name: (row.pjb_PatientsName || "").replace(/\^+/g, " ").trim(),
        patient_id: (row.pjb_PatientID || "").trim(),
        accession: (row.pjb_AccessionNumber || "").trim(),
        modality: (row.pjb_Modality || "").trim(),
        study_desc: (row.pjb_StudyDescription || "").trim(),
        study_date: formatStudyDate(row.pjb_StudyDate),
        first_seen: now,
      });
    }
  })();
}

function formatStudyDate(value: string | number | null) {
  const s = String(value ?? "").trim();
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

/** PDFCreator names each file "@<JobUID with dots as dashes>.pdf" */
function pdfPathFor(jobUid: string) {
  const file = path.join(PDF_DIR, `@${jobUid.replace(/\./g, "-")}.pdf`);
  return fs.existsSync(file) ? file : null;
}

// ---------------------------------------------------------------- jobs

/** Fill in PDFs and HL7 phones for unfinished jobs, then recompute their state. */
function refreshJobs() {
  const db = getDb();
  const open = db
    .prepare("SELECT * FROM jobs WHERE state NOT IN ('done','failed','no_whatsapp','signed_out')")
    .all() as JobRow[];
  const findPhone = db.prepare("SELECT phone FROM hl7_phones WHERE key = ?");
  const update = db.prepare(
    "UPDATE jobs SET pdf_path = ?, whatsapp_num = ?, phone_source = ?, state = ? WHERE id = ?"
  );

  db.transaction(() => {
    for (const job of open) {
      const pdf_path = job.pdf_path && fs.existsSync(job.pdf_path) ? job.pdf_path : pdfPathFor(job.job_uid);

      let { whatsapp_num, phone_source } = job;
      if (phone_source !== "manual") {
        const lookup = (key: string) => findPhone.get(key) as { phone: string } | undefined;
        // Accession is more specific than patient ID, so it wins when both exist
        const hit =
          (job.accession ? lookup(`acc:${job.accession}`) : undefined) ??
          (job.patient_id ? lookup(`pid:${job.patient_id}`) : undefined);
        if (hit) {
          whatsapp_num = hit.phone;
          phone_source = "hl7";
        }
      }

      const state = deriveState({ state: job.state, pdf_path, whatsapp_num });
      if (
        pdf_path !== job.pdf_path ||
        whatsapp_num !== job.whatsapp_num ||
        phone_source !== job.phone_source ||
        state !== job.state
      ) {
        update.run(pdf_path, whatsapp_num, phone_source, state, job.id);
      }
    }
  })();
}

// ---------------------------------------------------------------- HL7

function importHl7Phones() {
  if (!fs.existsSync(HL7_DIR)) throw new Error(`HL7 folder not found: ${HL7_DIR}`);

  const db = getDb();
  const seen = db.prepare("SELECT mtime FROM hl7_files WHERE name = ?");
  const markSeen = db.prepare(
    "INSERT INTO hl7_files (name, mtime) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET mtime = excluded.mtime"
  );
  const savePhone = db.prepare(`
    INSERT INTO hl7_phones (key, phone, source_file, seen_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET phone = excluded.phone, source_file = excluded.source_file, seen_at = excluded.seen_at
  `);

  for (const entry of fs.readdirSync(HL7_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(HL7_DIR, entry.name);
    const mtime = Math.floor(fs.statSync(file).mtimeMs);
    const prev = seen.get(entry.name) as { mtime: number } | undefined;
    if (prev?.mtime === mtime) continue;

    const message = parseHl7(fs.readFileSync(file, "latin1"));
    const now = new Date().toISOString();
    db.transaction(() => {
      if (message.phone) {
        if (message.patientId) savePhone.run(`pid:${message.patientId}`, message.phone, entry.name, now);
        for (const acc of message.accessions) savePhone.run(`acc:${acc}`, message.phone, entry.name, now);
      }
      markSeen.run(entry.name, mtime);
    })();
  }
}

type Hl7Message = { patientId: string | null; phone: string | null; accessions: string[] };

export function parseHl7(text: string): Hl7Message {
  const result: Hl7Message = { patientId: null, phone: null, accessions: [] };
  const segments = text.split(/\r\n|\r|\n/).filter(Boolean);
  const msh = segments.find((s) => s.startsWith("MSH"));
  const componentSep = msh?.[4] || "^";
  const repeatSep = msh?.[5] || "~";

  const first = (field?: string) => field?.split(repeatSep)[0]?.split(componentSep)[0]?.trim() || "";

  for (const segment of segments) {
    const f = segment.split("|");
    const type = f[0];

    if (type === "PID") {
      result.patientId = first(f[3]) || null;
      // PID-13 home phone, PID-14 business phone
      result.phone = parsePhone(f[13], componentSep, repeatSep) || parsePhone(f[14], componentSep, repeatSep);
    } else if (type === "ORC") {
      // ORC-2 placer, ORC-3 filler order number
      result.accessions.push(first(f[2]), first(f[3]));
    } else if (type === "OBR") {
      // OBR-2/3 order numbers, OBR-18 placer field 1 (often the accession)
      result.accessions.push(first(f[2]), first(f[3]), first(f[18]));
    }
  }

  result.accessions = [...new Set(result.accessions.filter(Boolean))];
  return result;
}

/** HL7 XTN is either "01001234567" or "^PRN^PH^^20^100^1234567" */
function parsePhone(field: string | undefined, componentSep: string, repeatSep: string) {
  if (!field) return null;
  for (const rep of field.split(repeatSep)) {
    const c = rep.split(componentSep);
    const plain = c[0]?.replace(/[^\d+]/g, "") || "";
    if (plain.replace("+", "").length >= 7) return plain;
    const composed = [c[4], c[5], c[6]].map((p) => (p || "").replace(/\D/g, "")).join("");
    if (composed.length >= 7) return (c[4] ? "+" : "") + composed;
  }
  return null;
}
