// Pulls ETIAM print jobs, their PDFs and HL7 phone numbers into nexta.db, and
// tells open dashboards which jobs changed.
import Database from "better-sqlite3";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { deriveState, getDb, pdfSources, sharedAccessions, stmt, usableAccession, type JobRow } from "@/lib/nexta-db";

const ETIAM_DB_PATH = process.env.ETIAM_DB_PATH || "C:\\ProgramData\\Etiam\\DcmPRI\\StorePrint\\sqlite.db";
const HL7_DIR = process.env.HL7_DIR || "E:\\pdfsend\\hl7";
// Folder the PDFs land in when ETIAM itself has none for a job. Files are named
// by accession: 330930.pdf, then 330930_2.pdf, 330930_3.pdf for later prints.
// Set PDF_DIR to an empty value to rely on ETIAM only.
const PDF_DIR = process.env.PDF_DIR ?? "E:\\pdf";
// Jobs this recent get their file list re-checked, so a later "_2" print shows up
const PDF_RECHECK_DAYS = 7;
// The general re-check only revisits jobs this recent, so its cost doesn't grow
// with history. New HL7 messages and PDFs still attach to jobs of any age: they
// say which accession / patient they're for, so those jobs are updated directly.
const ACTIVE_DAYS = 30;
// ETIAM writes in bursts; wait for it to settle before reading
const DEBOUNCE_MS = 500;
// Safety net: file events can be missed (network drives, sleep), so re-sync this often anyway
const FULL_SYNC_MS = 60_000;
// NEXTA_DEBUG=1 logs what triggered each sync and how long it took
const DEBUG = process.env.NEXTA_DEBUG === "1";

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
  /** HL7 files reported by the watcher since the last sync */
  pendingHl7: Set<string>;
  /** Re-read the whole HL7 folder next sync (startup, safety sync, unnamed event) */
  hl7FullScan: boolean;
  /** PDF files reported by the watcher since the last sync */
  pendingPdfs: Set<string>;
  /** List the PDF folder next sync to catch PDFs missed while not watching */
  pdfFullScan: boolean;
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
  pendingHl7: new Set(),
  hl7FullScan: true,
  pendingPdfs: new Set(),
  pdfFullScan: true,
});

/**
 * Subscribe to "jobs changed" notifications. `ids` lists the jobs that changed;
 * undefined means "reload everything". Returns the unsubscribe function.
 */
export function onJobsChanged(listener: (ids?: number[]) => void) {
  state.events.on("changed", listener);
  return () => state.events.off("changed", listener);
}

/** Tell every open dashboard which jobs changed (also used after a phone save or card move). */
export function notifyJobsChanged(ids?: number[]) {
  state.status.lastChange = new Date().toISOString();
  state.events.emit("changed", ids);
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
    if (Date.now() - state.lastRun > FULL_SYNC_MS) {
      state.hl7FullScan = true;
      state.pdfFullScan = true;
      syncNow();
    }
    attachWatchers();
  }, FULL_SYNC_MS);
}

/** Starts any watcher that isn't running yet (folder missing at boot, drive remounted, ...). */
function attachWatchers() {
  // Watch ETIAM's folder, not the file: SQLite also writes -wal/-journal files next to it
  const etiamFile = path.basename(ETIAM_DB_PATH);
  watch(path.dirname(ETIAM_DB_PATH), (file) => !file || file.startsWith(etiamFile));
  watch(HL7_DIR, (file) => {
    // Remember which HL7 file changed so the sync reads only that one
    if (file) state.pendingHl7.add(file);
    else state.hl7FullScan = true;
    return true;
  });
  if (PDF_DIR) {
    watch(PDF_DIR, (file) => {
      if (!file) {
        state.pdfFullScan = true;
        return true;
      }
      if (!file.toLowerCase().endsWith(".pdf")) return false;
      // Remember which PDF arrived so its accession's jobs are updated, whatever their age
      state.pendingPdfs.add(file);
      return true;
    });
  }
}

function watch(dir: string, relevant: (file: string | null) => boolean) {
  if (state.watchers.has(dir)) return;
  try {
    const watcher = fs.watch(dir, (_event, file) => {
      const name = file ? file.toString() : null;
      if (relevant(name)) {
        if (DEBUG) console.log(`[sync] change in ${dir}${name ? ` (${name})` : ""}`);
        scheduleSync();
      }
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
  const started = performance.now();
  const changed = new Set<number>();
  let etiamRows = 0;
  let hl7Files = 0;

  // Take the pending work now; events during this sync count for the next one
  const fullScan = state.hl7FullScan;
  const hl7Names = [...state.pendingHl7];
  const pdfFullScan = state.pdfFullScan;
  const pdfNames = [...state.pendingPdfs];
  state.hl7FullScan = false;
  state.pendingHl7.clear();
  state.pdfFullScan = false;
  state.pendingPdfs.clear();

  // Accessions / patient IDs that new HL7 messages or PDFs are for
  const hl7Keys = { accessions: new Set<string>(), patientIds: new Set<string>() };

  try {
    hl7Files = importHl7Phones(fullScan ? null : hl7Names, hl7Keys);
    if (state.status.hl7Error) console.log("HL7 import working again");
    state.status.hl7Error = null;
  } catch (err: any) {
    // Retry the full folder next time; log only when the problem changes
    state.hl7FullScan = true;
    if (state.status.hl7Error !== err.message) console.error("HL7 import failed:", err.message);
    state.status.hl7Error = err.message;
  }

  try {
    etiamRows = importEtiamJobs(changed);
    if (state.status.etiamError) console.log("ETIAM import working again");
    state.status.etiamError = null;
  } catch (err: any) {
    if (state.status.etiamError !== err.message) console.error("ETIAM import failed:", err.message);
    state.status.etiamError = err.message;
  }

  const pdfAccessions = pdfFullScan ? accessionsInPdfFolder() : accessionsOfPdfs(pdfNames);
  applyPdfFiles(changed, pdfAccessions);
  applyPhonesAndStates(changed, hl7Keys);
  state.status.lastSync = new Date().toISOString();

  if (DEBUG) {
    const ms = (performance.now() - started).toFixed(1);
    console.log(
      `[sync] ${ms} ms: ${etiamRows} ETIAM rows, ${hl7Files} HL7 file(s)${fullScan ? " (full scan)" : ""}, ` +
        `${changed.size} job(s) changed`
    );
  }
  if (changed.size > 0) notifyJobsChanged([...changed]);
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
    if (value === PDF_BLOB) return JSON.stringify([`etiam:${column}`]);
    if (typeof value === "string" && /\.pdf$/i.test(value.trim())) {
      const file = path.resolve(path.dirname(ETIAM_DB_PATH), value.trim());
      if (fs.existsSync(file)) return JSON.stringify([`file:${file}`]);
    }
  }
  return null;
}

/** Adds new/changed ETIAM jobs to nexta.db, recording their ids in `changed`. Returns rows read. */
function importEtiamJobs(changed: Set<number>) {
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

  const insert = stmt(`
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
    -- Skip no-op updates, so only real changes are reported
    WHERE jobs.patient_name IS NOT excluded.patient_name
       OR jobs.patient_id   IS NOT excluded.patient_id
       OR jobs.accession    IS NOT excluded.accession
       OR jobs.modality     IS NOT excluded.modality
       OR jobs.study_desc   IS NOT excluded.study_desc
       OR jobs.study_date   IS NOT excluded.study_date
       OR jobs.pdf_ref      IS NOT COALESCE(excluded.pdf_ref, jobs.pdf_ref)
  `);
  const idOf = stmt("SELECT id FROM jobs WHERE job_uid = ?");

  const now = new Date().toISOString();
  getDb().transaction(() => {
    for (const row of rows) {
      const jobUid = typeof row.pjb_JobUID === "string" ? row.pjb_JobUID.trim() : "";
      if (!jobUid) continue;
      const result = insert.run({
        job_uid: jobUid,
        patient_name: (row.pjb_PatientsName || "").replace(/\^+/g, " ").trim(),
        patient_id: (row.pjb_PatientID || "").trim(),
        accession: (row.pjb_AccessionNumber || "").trim(),
        modality: (row.pjb_Modality || "").trim(),
        study_desc: (row.pjb_StudyDescription || "").trim(),
        study_date: formatStudyDate(row.pjb_StudyDate),
        pdf_ref: findPdfInEtiamRow(row, columns),
        first_seen: now,
      });
      if (result.changes > 0) changed.add((idOf.get(jobUid) as { id: number }).id);
    }
  })();
  return rows.length;
}

function formatStudyDate(value: string | number | null) {
  const s = String(value ?? "").trim();
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

// ---------------------------------------------------------------- jobs

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** All PDFs for an accession, in print order: 330930.pdf, 330930_2.pdf, 330930_3.pdf, … */
function pdfFilesFor(accession: string): string[] {
  if (!PDF_DIR || !usableAccession(accession)) return [];
  const files: string[] = [];
  const base = path.join(PDF_DIR, `${accession}.pdf`);
  if (fs.existsSync(base)) files.push(base);
  // Later prints are numbered from _2 on; stop at the first gap
  for (let n = 2; n <= 50; n++) {
    const file = path.join(PDF_DIR, `${accession}_${n}.pdf`);
    if (!fs.existsSync(file)) break;
    files.push(file);
  }
  return files;
}

/** Accessions a PDF file name can belong to: "330930_2.pdf" is 330930's 2nd print (or accession "330930_2"). */
function accessionsOfPdfs(names: string[]): Set<string> {
  const accessions = new Set<string>();
  for (const name of names) {
    const stem = name.replace(/\.pdf$/i, "");
    accessions.add(stem);
    accessions.add(stem.replace(/_\d+$/, ""));
  }
  return accessions;
}

/**
 * Accessions in the PDF folder that a job is still missing a PDF for, of any
 * age. Used at startup and by the safety sync to catch PDFs that arrived while
 * Nexta wasn't watching. Lists file names only (no reading), so even a folder
 * with tens of thousands of PDFs is quick.
 */
function accessionsInPdfFolder(): Set<string> {
  if (!PDF_DIR || !fs.existsSync(PDF_DIR)) return new Set();
  const missing = new Set(
    (stmt("SELECT DISTINCT accession FROM jobs WHERE pdf_ref IS NULL AND accession <> ''").all() as {
      accession: string;
    }[]).map((r) => r.accession)
  );
  if (missing.size === 0) return new Set();
  const found = new Set<string>();
  for (const accession of accessionsOfPdfs(fs.readdirSync(PDF_DIR).filter((n) => /\.pdf$/i.test(n)))) {
    if (missing.has(accession)) found.add(accession);
  }
  return found;
}

/** Placeholders for an IN (...) list of `count` values */
const inList = (count: number) => Array.from({ length: count }, () => "?").join(",");

/**
 * Match jobs to the PDFs in PDF_DIR by accession number (all states, so
 * sent/failed jobs show their report too): recent jobs, plus jobs of any age
 * whose accession a new PDF is for. Jobs whose PDF came from ETIAM itself are
 * left alone. Records changed ids in `changed`.
 */
function applyPdfFiles(changed: Set<number>, newPdfAccessions: Set<string>) {
  const jobs = stmt(
    `SELECT id, accession, pdf_ref FROM jobs
     WHERE (pdf_ref IS NULL AND first_seen >= ?)
        OR (pdf_ref NOT LIKE '%"etiam:%' AND first_seen >= ?)`
  ).all(daysAgo(ACTIVE_DAYS), daysAgo(PDF_RECHECK_DAYS)) as Pick<JobRow, "id" | "accession" | "pdf_ref">[];

  if (newPdfAccessions.size) {
    const accessions = [...newPdfAccessions];
    const older = getDb()
      .prepare(
        `SELECT id, accession, pdf_ref FROM jobs
         WHERE accession IN (${inList(accessions.length)})
           AND (pdf_ref IS NULL OR pdf_ref NOT LIKE '%"etiam:%')`
      )
      .all(...accessions) as Pick<JobRow, "id" | "accession" | "pdf_ref">[];
    const seen = new Set(jobs.map((j) => j.id));
    for (const job of older) if (!seen.has(job.id)) jobs.push(job);
  }

  // An accession used by two different patients can't safely pick a PDF
  const ambiguous = sharedAccessions();
  const filesByAccession = new Map<string, string[]>();
  const setPdf = stmt("UPDATE jobs SET pdf_ref = ? WHERE id = ?");

  getDb().transaction(() => {
    for (const job of jobs) {
      if (ambiguous.has(job.accession)) continue;
      if (!filesByAccession.has(job.accession)) filesByAccession.set(job.accession, pdfFilesFor(job.accession));
      const files = filesByAccession.get(job.accession)!;
      const pdf_ref = files.length ? JSON.stringify(files.map((f) => `file:${f}`)) : null;
      if (pdf_ref !== job.pdf_ref) {
        setPdf.run(pdf_ref, job.id);
        changed.add(job.id);
      }
    }
  })();
}

/**
 * For unfinished jobs: attach the phone number HL7 has (numbers typed in by
 * hand are never replaced) and work out the state. Covers recent jobs, plus
 * jobs of any age that a new HL7 message names or whose PDF just changed.
 * Records changed ids.
 */
function applyPhonesAndStates(
  changed: Set<number>,
  hl7Keys: { accessions: Set<string>; patientIds: Set<string> }
) {
  const open = stmt(
    `SELECT * FROM jobs
     WHERE state NOT IN ('done','failed','no_whatsapp','signed_out') AND first_seen >= ?`
  ).all(daysAgo(ACTIVE_DAYS)) as JobRow[];

  const accessions = [...hl7Keys.accessions];
  const patientIds = [...hl7Keys.patientIds];
  const ids = [...changed];
  if (accessions.length || patientIds.length || ids.length) {
    const where = [
      accessions.length ? `accession IN (${inList(accessions.length)})` : null,
      patientIds.length ? `patient_id IN (${inList(patientIds.length)})` : null,
      ids.length ? `id IN (${inList(ids.length)})` : null,
    ].filter(Boolean);
    const older = getDb()
      .prepare(
        `SELECT * FROM jobs
         WHERE state NOT IN ('done','failed','no_whatsapp','signed_out') AND (${where.join(" OR ")})`
      )
      .all(...accessions, ...patientIds, ...ids) as JobRow[];
    const seen = new Set(open.map((j) => j.id));
    for (const job of older) if (!seen.has(job.id)) open.push(job);
  }
  const findPhone = stmt("SELECT phone FROM hl7_phones WHERE key = ?");
  const lookup = (key: string) => findPhone.get(key) as { phone: string } | undefined;
  const update = stmt("UPDATE jobs SET whatsapp_num = ?, phone_source = ?, state = ? WHERE id = ?");

  getDb().transaction(() => {
    for (const job of open) {
      let { whatsapp_num, phone_source } = job;
      if (phone_source !== "manual") {
        // Accession is more specific than patient ID, so it wins when both exist
        // (but never a placeholder accession like "XXXX", shared by many patients)
        const hit =
          (usableAccession(job.accession) ? lookup(`acc:${job.accession}`) : undefined) ??
          (job.patient_id ? lookup(`pid:${job.patient_id}`) : undefined);
        if (hit) {
          whatsapp_num = hit.phone;
          phone_source = "hl7";
        }
      }

      const next = deriveState({ state: job.state, whatsapp_num, pdf_ref: job.pdf_ref });
      if (whatsapp_num !== job.whatsapp_num || phone_source !== job.phone_source || next !== job.state) {
        update.run(whatsapp_num, phone_source, next, job.id);
        changed.add(job.id);
      }
    }
  })();
}

/** Path of a job's n-th PDF when it's a file on disk (so it can be streamed), else null. */
export function jobPdfFile(job: JobRow, index = 0): string | null {
  const source = pdfSources(job.pdf_ref)[index];
  if (!source?.startsWith("file:")) return null;
  const file = source.slice("file:".length);
  return fs.existsSync(file) ? file : null;
}

/** Bytes of a job's n-th PDF (0 = first), from ETIAM's row or from disk. Null if it's gone. */
export function readJobPdf(job: JobRow, index = 0): Buffer | null {
  const source = pdfSources(job.pdf_ref)[index];
  if (!source) return null;

  if (source.startsWith("file:")) {
    const file = jobPdfFile(job, index);
    return file ? fs.readFileSync(file) : null;
  }

  if (source.startsWith("etiam:")) {
    const column = source.slice("etiam:".length);
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

/**
 * Reads phone numbers from HL7 files: only `names` (the files the watcher
 * reported), or the whole folder when `names` is null. Files already read and
 * unchanged since are skipped. Adds the accessions / patient IDs that got a
 * number to `keys`. Returns how many files were parsed.
 */
function importHl7Phones(
  names: string[] | null,
  keys: { accessions: Set<string>; patientIds: Set<string> }
) {
  if (!fs.existsSync(HL7_DIR)) throw new Error(`HL7 folder not found: ${HL7_DIR}`);

  const seen = stmt("SELECT mtime FROM hl7_files WHERE name = ?");
  const markSeen = stmt(
    "INSERT INTO hl7_files (name, mtime) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET mtime = excluded.mtime"
  );
  const savePhone = stmt(`
    INSERT INTO hl7_phones (key, phone, source_file, seen_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET phone = excluded.phone, source_file = excluded.source_file, seen_at = excluded.seen_at
  `);

  const candidates =
    names ??
    fs
      .readdirSync(HL7_DIR, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);

  let parsed = 0;
  for (const name of candidates) {
    // Only plain names inside HL7_DIR (the watcher reports names, never paths)
    if (name !== path.basename(name)) continue;
    const file = path.join(HL7_DIR, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      continue; // deleted or moved since the event
    }
    if (!stat.isFile()) continue;
    const mtime = Math.floor(stat.mtimeMs);
    const prev = seen.get(name) as { mtime: number } | undefined;
    if (prev?.mtime === mtime) continue;

    const message = parseHl7(fs.readFileSync(file, "latin1"));
    const now = new Date().toISOString();
    getDb().transaction(() => {
      if (message.phone) {
        if (message.patientId) {
          savePhone.run(`pid:${message.patientId}`, message.phone, name, now);
          keys.patientIds.add(message.patientId);
        }
        for (const acc of message.accessions) {
          if (!usableAccession(acc)) continue;
          savePhone.run(`acc:${acc}`, message.phone, name, now);
          keys.accessions.add(acc);
        }
      }
      markSeen.run(name, mtime);
    })();
    parsed++;
  }
  return parsed;
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
