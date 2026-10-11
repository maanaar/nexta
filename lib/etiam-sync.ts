// Pulls ETIAM print jobs, their PDFs and HL7 phone numbers into nexta.db, and
// tells open dashboards when something changed.
import Database from "better-sqlite3";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { deriveState, getDb, type JobRow } from "@/lib/nexta-db";

const ETIAM_DB_PATH = process.env.ETIAM_DB_PATH || "C:\\ProgramData\\Etiam\\DcmPRI\\StorePrint\\sqlite.db";
const HL7_DIR = process.env.HL7_DIR || "E:\\pdfsend\\hl7";
// Fallback when ETIAM itself has no PDF for a job: PDFCreator's output folder.
// Set PDF_DIR to an empty value to rely on ETIAM only.
const PDF_DIR = process.env.PDF_DIR ?? "E:\\pdfsend\\processed";
// ETIAM writes in bursts; wait for it to settle before reading
const DEBOUNCE_MS = 500;
// Safety net: file events can be missed (network drives, sleep), so re-sync this often anyway
const FULL_SYNC_MS = 60_000;

export type SyncStatus = {
  lastSync: string | null;
  lastChange: string | null;
  watching: boolean;
  etiamError: string | null;
  hl7Error: string | null;
};

// Kept on globalThis: instrumentation and route handlers are bundled separately
// and would otherwise each get their own copy of this module's state.
type SyncState = {
  status: SyncStatus;
  running: Promise<void> | null;
  lastRun: number;
  started: boolean;
  watchers: Map<string, fs.FSWatcher>;
  debounce: NodeJS.Timeout | null;
  events: EventEmitter;
  watchWarned: Set<string>;
  schemaLogged: boolean;
};
const g = globalThis as typeof globalThis & { __nextaSync?: SyncState };
const state: SyncState = (g.__nextaSync ??= {
  status: { lastSync: null, lastChange: null, watching: false, etiamError: null, hl7Error: null },
  running: null,
  lastRun: 0,
  started: false,
  watchers: new Map(),
  debounce: null,
  events: new EventEmitter().setMaxListeners(0),
  watchWarned: new Set(),
  schemaLogged: false,
});

/** Subscribe to "jobs changed" notifications. Returns the unsubscribe function. */
export function onJobsChanged(listener: () => void) {
  state.events.on("changed", listener);
  return () => state.events.off("changed", listener);
}

/** Tell every open dashboard to reload (also used after a phone number is saved). */
export function notifyJobsChanged() {
  state.status.lastChange = new Date().toISOString();
  state.events.emit("changed");
}

/** Runs one sync, or joins the one already in progress. */
export async function syncNow(): Promise<SyncStatus> {
  state.running ??= Promise.resolve()
    .then(runSync)
    .finally(() => {
      state.lastRun = Date.now();
      state.running = null;
    });
  await state.running;
  return state.status;
}

/** Used by API routes: the watcher keeps data fresh, this only covers it not running. */
export async function syncIfStale(): Promise<SyncStatus> {
  if (state.running) await state.running;
  else if (Date.now() - state.lastRun > FULL_SYNC_MS) await syncNow();
  return state.status;
}

/**
 * Started once when the Next.js server boots (see instrumentation.ts).
 * Subscribes to OS file-change events for the ETIAM database, the HL7 folder
 * and the PDF folder, so a sync runs the moment any of them changes. Nothing
 * polls ETIAM.
 */
export function startEtiamWatcher() {
  if (state.started) return;
  state.started = true;
  state.status.watching = true;

  syncNow();
  attachWatchers();
  // Safety net, and re-attaches watchers if a folder appeared or was remounted
  setInterval(() => {
    if (Date.now() - state.lastRun > FULL_SYNC_MS) syncNow();
    attachWatchers();
  }, FULL_SYNC_MS);
}

/** Starts any watcher that isn't running yet (folder missing at boot, drive remounted, ...). */
function attachWatchers() {
  // Watch ETIAM's folder, not the file: SQLite also writes -wal/-journal files next to it
  const etiamFile = path.basename(ETIAM_DB_PATH);
  watch(path.dirname(ETIAM_DB_PATH), (file) => !file || file.startsWith(etiamFile));
  watch(HL7_DIR, () => true);
  if (PDF_DIR) watch(PDF_DIR, (file) => !file || file.toLowerCase().endsWith(".pdf"));
}

function watch(dir: string, relevant: (file: string | null) => boolean) {
  if (state.watchers.has(dir)) return;
  try {
    const watcher = fs.watch(dir, (_event, file) => {
      if (relevant(file ? file.toString() : null)) scheduleSync();
    });
    watcher.on("error", (err) => {
      console.error(`Stopped watching ${dir}:`, err.message);
      watcher.close();
      state.watchers.delete(dir);
    });
    state.watchers.set(dir, watcher);
    state.watchWarned.delete(dir);
    console.log(`Watching ${dir} for changes`);
  } catch (err: any) {
    if (!state.watchWarned.has(dir)) console.error(`Can't watch ${dir} (will keep retrying):`, err.message);
    state.watchWarned.add(dir);
  }
}

function scheduleSync() {
  if (state.debounce) clearTimeout(state.debounce);
  state.debounce = setTimeout(() => {
    state.debounce = null;
    syncNow();
  }, DEBOUNCE_MS);
}

function runSync() {
  let changes = 0;

  try {
    importHl7Phones();
    if (state.status.hl7Error) console.log("HL7 import working again");
    state.status.hl7Error = null;
  } catch (err: any) {
    // Log only when the problem changes, not on every sync
    if (state.status.hl7Error !== err.message) console.error("HL7 import failed:", err.message);
    state.status.hl7Error = err.message;
  }

  try {
    changes += importEtiamJobs();
    if (state.status.etiamError) console.log("ETIAM import working again");
    state.status.etiamError = null;
  } catch (err: any) {
    if (state.status.etiamError !== err.message) console.error("ETIAM import failed:", err.message);
    state.status.etiamError = err.message;
  }

  changes += applyPdfsAndPhones();
  state.status.lastSync = new Date().toISOString();
  if (changes > 0) notifyJobsChanged();
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
  // Plus whatever other columns this ETIAM version has (scanned for a PDF)
  [column: string]: unknown;
};

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

function openEtiam() {
  // Read-only, and wait (instead of failing) if ETIAM is mid-write
  return new Database(ETIAM_DB_PATH, { readonly: true, fileMustExist: true, timeout: 5000 });
}

// Stands in for a BLOB value that starts with "%PDF" (see readPrintJobs)
const PDF_BLOB = "__nexta_pdf_blob__";

/**
 * Reads every PrintJob column, but never pulls a binary (BLOB) value into
 * memory: a BLOB that starts with "%PDF" comes back as PDF_BLOB and any other
 * BLOB as null, so a table holding images stays cheap to scan.
 */
function readPrintJobs(etiam: Database.Database) {
  const columns = (etiam.prepare("PRAGMA table_info(PrintJob)").all() as { name: string }[]).map((c) => c.name);
  const select = columns
    .map((c) => {
      const q = quoteIdent(c);
      return `CASE WHEN typeof(${q}) <> 'blob' THEN ${q}
                   WHEN substr(${q}, 1, 4) = X'25504446' THEN '${PDF_BLOB}' END AS ${q}`;
    })
    .join(", ");
  const rows = etiam.prepare(`SELECT ${select} FROM PrintJob`).all() as PrintJobRow[];
  return { columns, rows };
}

/** A PDF ETIAM itself holds for this row: stored in a column, or a path to a .pdf file. */
function findPdfInEtiamRow(row: PrintJobRow, columns: string[]): string | null {
  for (const column of columns) {
    const value = row[column];
    if (value === PDF_BLOB) return `etiam:${column}`;
    if (typeof value === "string" && /\.pdf$/i.test(value.trim())) {
      const file = path.resolve(path.dirname(ETIAM_DB_PATH), value.trim());
      if (fs.existsSync(file)) return `file:${file}`;
    }
  }
  return null;
}

/** Returns how many jobs were added or changed. */
function importEtiamJobs() {
  const etiam = openEtiam();
  let columns: string[];
  let rows: PrintJobRow[];
  try {
    ({ columns, rows } = readPrintJobs(etiam));
  } finally {
    etiam.close();
  }

  if (!state.schemaLogged) {
    // Tells us on the real server what ETIAM's PrintJob table actually contains
    console.log(`ETIAM PrintJob columns: ${columns.join(", ")}`);
    state.schemaLogged = true;
  }

  const insert = getDb().prepare(`
    INSERT INTO jobs (job_uid, patient_name, patient_id, accession, modality, study_desc, study_date, pdf_ref, state, first_seen)
    VALUES (@job_uid, @patient_name, @patient_id, @accession, @modality, @study_desc, @study_date, @pdf_ref, 'waiting', @first_seen)
    ON CONFLICT(job_uid) DO UPDATE SET
      patient_name = excluded.patient_name,
      patient_id   = excluded.patient_id,
      accession    = excluded.accession,
      modality     = excluded.modality,
      study_desc   = excluded.study_desc,
      study_date   = excluded.study_date,
      -- Keep a PDF found earlier (e.g. in the PDF folder) if ETIAM has none
      pdf_ref      = COALESCE(excluded.pdf_ref, jobs.pdf_ref)
    -- Skip no-op updates, so the change count only reflects real changes
    WHERE jobs.patient_name IS NOT excluded.patient_name
       OR jobs.patient_id   IS NOT excluded.patient_id
       OR jobs.accession    IS NOT excluded.accession
       OR jobs.modality     IS NOT excluded.modality
       OR jobs.study_desc   IS NOT excluded.study_desc
       OR jobs.study_date   IS NOT excluded.study_date
       OR jobs.pdf_ref      IS NOT COALESCE(excluded.pdf_ref, jobs.pdf_ref)
  `);

  const now = new Date().toISOString();
  let changes = 0;
  getDb().transaction(() => {
    for (const row of rows) {
      const jobUid = typeof row.pjb_JobUID === "string" ? row.pjb_JobUID.trim() : "";
      if (!jobUid) continue;
      changes += insert.run({
        job_uid: jobUid,
        patient_name: (row.pjb_PatientsName || "").replace(/\^+/g, " ").trim(),
        patient_id: (row.pjb_PatientID || "").trim(),
        accession: (row.pjb_AccessionNumber || "").trim(),
        modality: (row.pjb_Modality || "").trim(),
        study_desc: (row.pjb_StudyDescription || "").trim(),
        study_date: formatStudyDate(row.pjb_StudyDate),
        pdf_ref: findPdfInEtiamRow(row, columns),
        first_seen: now,
      }).changes;
    }
  })();
  return changes;
}

function formatStudyDate(value: string | number | null) {
  const s = String(value ?? "").trim();
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

// ---------------------------------------------------------------- jobs

/** PDFCreator names each file "@<JobUID with dots as dashes>.pdf" */
function pdfFileFor(jobUid: string) {
  if (!PDF_DIR) return null;
  const file = path.join(PDF_DIR, `@${jobUid.replace(/\./g, "-")}.pdf`);
  return fs.existsSync(file) ? `file:${file}` : null;
}

/**
 * Find PDFs ETIAM didn't have (for every job, so sent/failed ones show their
 * report too), then for unfinished jobs attach the phone number HL7 has
 * (numbers typed in by hand are never replaced) and work out the state.
 * Returns how many jobs changed.
 */
function applyPdfsAndPhones() {
  const db = getDb();
  let changes = 0;

  const missingPdf = db.prepare("SELECT id, job_uid FROM jobs WHERE pdf_ref IS NULL").all() as Pick<JobRow, "id" | "job_uid">[];
  const setPdf = db.prepare("UPDATE jobs SET pdf_ref = ? WHERE id = ?");
  db.transaction(() => {
    for (const job of missingPdf) {
      const pdf_ref = pdfFileFor(job.job_uid);
      if (pdf_ref) {
        setPdf.run(pdf_ref, job.id);
        changes++;
      }
    }
  })();

  const open = db
    .prepare("SELECT * FROM jobs WHERE state NOT IN ('done','failed','no_whatsapp','signed_out')")
    .all() as JobRow[];
  const findPhone = db.prepare("SELECT phone FROM hl7_phones WHERE key = ?");
  const lookup = (key: string) => findPhone.get(key) as { phone: string } | undefined;
  const update = db.prepare("UPDATE jobs SET whatsapp_num = ?, phone_source = ?, state = ? WHERE id = ?");

  db.transaction(() => {
    for (const job of open) {
      let { whatsapp_num, phone_source } = job;
      if (phone_source !== "manual") {
        // Accession is more specific than patient ID, so it wins when both exist
        const hit =
          (job.accession ? lookup(`acc:${job.accession}`) : undefined) ??
          (job.patient_id ? lookup(`pid:${job.patient_id}`) : undefined);
        if (hit) {
          whatsapp_num = hit.phone;
          phone_source = "hl7";
        }
      }

      const next = deriveState({ state: job.state, whatsapp_num, pdf_ref: job.pdf_ref });
      if (whatsapp_num !== job.whatsapp_num || phone_source !== job.phone_source || next !== job.state) {
        update.run(whatsapp_num, phone_source, next, job.id);
        changes++;
      }
    }
  })();
  return changes;
}

/** The PDF bytes for a job, from ETIAM's row or from disk. Null if it's gone. */
export function readJobPdf(job: JobRow): Buffer | null {
  if (!job.pdf_ref) return null;

  if (job.pdf_ref.startsWith("file:")) {
    const file = job.pdf_ref.slice("file:".length);
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  }

  if (job.pdf_ref.startsWith("etiam:")) {
    const column = job.pdf_ref.slice("etiam:".length);
    const etiam = openEtiam();
    try {
      // Only ever a column name that exists in PrintJob
      const columns = (etiam.prepare("PRAGMA table_info(PrintJob)").all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes(column)) return null;
      const row = etiam
        .prepare(`SELECT ${quoteIdent(column)} AS pdf FROM PrintJob WHERE pjb_JobUID = ?`)
        .get(job.job_uid) as { pdf: unknown } | undefined;
      // ETIAM may already have cleared the job
      return Buffer.isBuffer(row?.pdf) ? row.pdf : null;
    } finally {
      etiam.close();
    }
  }

  return null;
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
