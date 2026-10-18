// Pulls ETIAM print jobs, their PDFs and HL7 phone numbers into nexta.db, and
// tells open dashboards which jobs changed.
import Database from "better-sqlite3";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { containsMode, getConfig, jobPdfKey, matchesByPatientId, usesAccession } from "@/lib/config";
import { FolderIndex, allKeysIn, keysOf, stemOf } from "@/lib/pdf-match";
import { signFiles } from "@/lib/pdf-sig";
import { DEFAULT_COUNTRY_CODE, detectCountry, normalizePhone } from "@/lib/phone";
import {
  deriveState,
  dropDuplicateCases,
  getDb,
  pdfSources,
  sharedPdfKeys,
  stmt,
  usableAccession,
  type JobRow,
} from "@/lib/nexta-db";

// Paths and the PDF naming come from the Settings page (lib/config.ts), read on
// every use so a change applies without restarting. PDFs are named by the
// chosen pattern, e.g. accession: 330930.pdf, then 330930_2.pdf, _3 … for later prints.
const etiamDbPath = () => getConfig().etiamDbPath;
const hl7Dir = () => getConfig().hl7Dir;
const pdfDir = () => getConfig().pdfDir;
const debug = () => getConfig().debug;
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

export type SyncStatus = {
  lastSync: string | null;
  lastChange: string | null;
  watching: boolean;
  etiamError: string | null;
  hl7Error: string | null;
  /** Anything else that went wrong while matching PDFs / phones */
  syncError: string | null;
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
const g = globalThis as typeof globalThis & {
  __nextaSync?: SyncState;
  /** The PDF folder's file names, when PDFs are matched by what their name contains */
  __nextaPdfIndex?: { index: FolderIndex; dir: string } | null;
};
const state: SyncState = (g.__nextaSync ??= {
  status: { lastSync: null, lastChange: null, watching: false, etiamError: null, hl7Error: null, syncError: null },
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

  // The PDF naming may have changed (e.g. in .env) since the last run
  recomputePdfKeys();
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

/**
 * Applies settings saved on the Settings page: the watchers move to the new
 * folders, jobs get their new expected PDF names, and a full sync runs. No
 * restart needed.
 */
export async function applyConfigChange(): Promise<SyncStatus> {
  for (const watcher of state.watchers.values()) watcher.close();
  state.watchers.clear();
  state.watchWarned.clear();
  state.schemaLogged = false;
  state.hl7FullScan = true;
  state.pdfFullScan = true;
  g.__nextaPdfIndex = null;
  const changed = recomputePdfKeys();
  if (state.started) attachWatchers();
  if (changed.size) notifyJobsChanged([...changed]);
  return syncNow();
}

/** Starts any watcher that isn't running yet (folder missing at boot, drive remounted, ...). */
function attachWatchers() {
  // Watch ETIAM's folder, not the file: SQLite also writes -wal/-journal files next to it
  const etiamFile = path.basename(etiamDbPath());
  watch(path.dirname(etiamDbPath()), (file) => !file || file.startsWith(etiamFile));
  watch(hl7Dir(), (file) => {
    // Remember which HL7 file changed so the sync reads only that one
    if (file) state.pendingHl7.add(file);
    else state.hl7FullScan = true;
    return true;
  });
  if (pdfDir()) {
    watch(pdfDir(), (file) => {
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
        if (debug()) console.log(`[sync] change in ${dir}${name ? ` (${name})` : ""}`);
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

  try {
    refreshPdfIndex(pdfFullScan, pdfNames);
    const pdfKeys = containsMode()
      ? pdfFullScan
        ? keysMissingInIndex()
        : keysInNewFiles(pdfNames)
      : pdfFullScan
        ? keysInPdfFolder()
        : keysOfPdfs(pdfNames);
    applyPdfFiles(changed, pdfKeys);
    applyPhonesAndStates(changed, hl7Keys);
    if (state.status.syncError) console.log("Matching PDFs and phone numbers working again");
    state.status.syncError = null;
  } catch (err: any) {
    // Never let a matching problem break the dashboard; retry the full folder next time
    state.pdfFullScan = true;
    if (state.status.syncError !== err.message) console.error("Matching PDFs / phone numbers failed:", err);
    state.status.syncError = err.message;
  }
  state.status.lastSync = new Date().toISOString();

  if (debug()) {
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
  return new Database(etiamDbPath(), { readonly: true, fileMustExist: true, timeout: 5000 });
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
  let rows: PrintJobRow[];
  try {
    // oldest first, so when two prints are the same exam the later one wins
    rows = etiam.prepare(`SELECT ${select} FROM PrintJob ORDER BY rowid`).all() as PrintJobRow[];
  } catch {
    rows = etiam.prepare(`SELECT ${select} FROM PrintJob`).all() as PrintJobRow[];
  }
  return { columns, rows };
}

/** A PDF ETIAM itself holds for this row: stored in a column, or a path to a .pdf file. */
function findPdfInEtiamRow(row: PrintJobRow, columns: string[]): string | null {
  for (const column of columns) {
    const value = row[column];
    if (value === PDF_BLOB) return JSON.stringify([`etiam:${column}`]);
    if (typeof value === "string" && /\.pdf$/i.test(value.trim())) {
      const file = path.resolve(path.dirname(etiamDbPath()), value.trim());
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
    INSERT INTO jobs (job_uid, patient_name, patient_id, accession, modality, study_desc, study_date, pdf_key, pdf_ref, pdf_attached_at, state, first_seen)
    VALUES (@job_uid, @patient_name, @patient_id, @accession, @modality, @study_desc, @study_date, @pdf_key, @pdf_ref, @pdf_attached_at, 'waiting', @first_seen)
    ON CONFLICT(job_uid) DO UPDATE SET
      patient_name = excluded.patient_name,
      patient_id   = excluded.patient_id,
      accession    = excluded.accession,
      modality     = excluded.modality,
      study_desc   = excluded.study_desc,
      study_date   = excluded.study_date,
      pdf_key      = excluded.pdf_key,
      -- Keep a PDF found earlier (e.g. in the PDF folder) if ETIAM has none
      pdf_ref      = COALESCE(excluded.pdf_ref, jobs.pdf_ref),
      pdf_attached_at = COALESCE(jobs.pdf_attached_at, excluded.pdf_attached_at)
    -- Skip no-op updates, so only real changes are reported
    WHERE jobs.patient_name IS NOT excluded.patient_name
       OR jobs.patient_id   IS NOT excluded.patient_id
       OR jobs.accession    IS NOT excluded.accession
       OR jobs.modality     IS NOT excluded.modality
       OR jobs.study_desc   IS NOT excluded.study_desc
       OR jobs.study_date   IS NOT excluded.study_date
       OR jobs.pdf_key      IS NOT excluded.pdf_key
       OR jobs.pdf_ref      IS NOT COALESCE(excluded.pdf_ref, jobs.pdf_ref)
  `);
  const idOf = stmt("SELECT id FROM jobs WHERE job_uid = ?");
  // One case per accession: a re-print (new job id, same accession) updates the case we already have
  const byAccession = stmt("SELECT id, job_uid FROM jobs WHERE accession = ? AND patient_id = ? ORDER BY id LIMIT 1");
  const refresh = stmt(`
    UPDATE jobs SET patient_name = @patient_name, patient_id = @patient_id, modality = @modality, study_desc = @study_desc,
      study_date = @study_date, pdf_key = @pdf_key, pdf_ref = COALESCE(@pdf_ref, pdf_ref),
      pdf_attached_at = COALESCE(pdf_attached_at, @pdf_attached_at)
    WHERE id = @id AND (patient_name IS NOT @patient_name OR patient_id IS NOT @patient_id OR modality IS NOT @modality
      OR study_desc IS NOT @study_desc OR study_date IS NOT @study_date OR pdf_key IS NOT @pdf_key
      OR pdf_ref IS NOT COALESCE(@pdf_ref, pdf_ref))
  `);

  const now = new Date().toISOString();
  const config = getConfig();
  const byAccessionNow = usesAccession(config);
  // Reports are found by accession: the same exam (accession + patient ID) printed twice is one case, and
  // the latest print is the one we use
  if (byAccessionNow) dropDuplicateCases();
  const latestOf = new Map<string, string>();
  if (byAccessionNow) {
    for (const row of rows) {
      const acc = (row.pjb_AccessionNumber || "").trim();
      const uid = typeof row.pjb_JobUID === "string" ? row.pjb_JobUID.trim() : "";
      if (uid && usableAccession(acc)) latestOf.set(`${acc}|${(row.pjb_PatientID || "").trim()}`, uid);
    }
  }
  getDb().transaction(() => {
    for (const row of rows) {
      const jobUid = typeof row.pjb_JobUID === "string" ? row.pjb_JobUID.trim() : "";
      if (!jobUid) continue;
      const job = {
        job_uid: jobUid,
        patient_name: (row.pjb_PatientsName || "").replace(/\^+/g, " ").trim(),
        patient_id: (row.pjb_PatientID || "").trim(),
        accession: (row.pjb_AccessionNumber || "").trim(),
      };
      // While reports are looked for by accession number, a print job without a real one (empty, N/A, XXXX, 0000)
      // is not pulled in at all: it could never get its report. With another naming pattern it is pulled as usual.
      // Likewise when reports are found by patient ID: a print job without one can never get its report. Several
      // cases with the same patient ID are all pulled (unlike accession, where the same exam is one case).
      if (matchesByPatientId(config) && !usableAccession(job.patient_id)) continue;
      if (byAccessionNow && !usableAccession(job.accession)) continue;
      if (byAccessionNow && latestOf.get(`${job.accession}|${job.patient_id}`) !== jobUid) continue; // an earlier print of the same exam
      const fields = {
        ...job,
        modality: (row.pjb_Modality || "").trim(),
        study_desc: (row.pjb_StudyDescription || "").trim(),
        study_date: formatStudyDate(row.pjb_StudyDate),
        pdf_key: jobPdfKey(job, config),
        ...etiamPdf(row, columns, now),
      };
      if (byAccessionNow && !idOf.get(jobUid)) {
        const existing = byAccession.get(job.accession, job.patient_id) as { id: number; job_uid: string } | undefined;
        if (existing) {
          const { job_uid: _uid, accession: _acc, ...update } = fields;
          if (refresh.run({ ...update, id: existing.id }).changes > 0) changed.add(existing.id);
          continue;
        }
      }
      const result = insert.run({ ...fields, first_seen: now });
      if (result.changes > 0) changed.add((idOf.get(jobUid) as { id: number }).id);
    }
  })();
  return rows.length;
}

function etiamPdf(row: PrintJobRow, columns: string[], now: string) {
  const pdf_ref = findPdfInEtiamRow(row, columns);
  return { pdf_ref, pdf_attached_at: pdf_ref ? now : null };
}

function formatStudyDate(value: string | number | null) {
  const s = String(value ?? "").trim();
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

// ---------------------------------------------------------------- jobs

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/**
 * Recalculates every job's expected PDF name under the current naming pattern.
 * Jobs whose name changed lose their folder PDFs (found under the old naming)
 * and are re-matched by the next sync. Returns the ids that changed.
 */
function recomputePdfKeys(): Set<number> {
  const config = getConfig();
  const jobs = stmt("SELECT id, job_uid, accession, patient_id, patient_name, pdf_key, pdf_ref FROM jobs").all() as JobRow[];
  const update = stmt(
    `UPDATE jobs SET pdf_key = ?,
       pdf_ref = CASE WHEN pdf_ref LIKE '%"etiam:%' THEN pdf_ref END
     WHERE id = ?`
  );
  const changed = new Set<number>();
  getDb().transaction(() => {
    for (const job of jobs) {
      const key = jobPdfKey(job, config);
      if (key !== job.pdf_key) {
        update.run(key, job.id);
        changed.add(job.id);
      }
    }
  })();
  if (changed.size) state.pdfFullScan = true;
  return changed;
}

/** All PDFs for a file name, in print order: 330930.pdf, 330930_2.pdf, 330930_3.pdf, … */
function pdfFilesFor(key: string | null): string[] {
  const dir = pdfDir();
  if (!dir || !key) return [];
  const files: string[] = [];
  const base = path.join(dir, `${key}.pdf`);
  if (fs.existsSync(base)) files.push(base);
  // Later prints are numbered from _2 on; stop at the first gap
  for (let n = 2; n <= 50; n++) {
    const file = path.join(dir, `${key}_${n}.pdf`);
    if (!fs.existsSync(file)) break;
    files.push(file);
  }
  return files;
}

/** Expected names a PDF file can belong to: "330930_2.pdf" is 330930's 2nd print (or a name "330930_2"). Lower-cased. */
function keysOfPdfs(names: string[]): Set<string> {
  const keys = new Set<string>();
  for (const name of names) {
    const stem = name.replace(/\.pdf$/i, "").toLowerCase();
    keys.add(stem);
    keys.add(stem.replace(/_\d+$/, ""));
  }
  return keys;
}

/**
 * Names in the PDF folder that a job (of any age) is still missing a PDF for.
 * Used at startup and by the safety sync to catch PDFs that arrived while
 * Nexta wasn't watching. Lists file names only (no reading), so even a folder
 * with tens of thousands of PDFs is quick.
 */
function keysInPdfFolder(): Set<string> {
  const dir = pdfDir();
  if (!dir || !fs.existsSync(dir)) return new Set();
  const missing = new Set(
    (stmt("SELECT DISTINCT lower(pdf_key) AS k FROM jobs WHERE pdf_ref IS NULL AND pdf_key IS NOT NULL").all() as {
      k: string;
    }[]).map((r) => r.k)
  );
  if (missing.size === 0) return new Set();
  const found = new Set<string>();
  for (const key of keysOfPdfs(fs.readdirSync(dir).filter((n) => /\.pdf$/i.test(n)))) {
    if (missing.has(key)) found.add(key);
  }
  return found;
}

// ---- matching by what the file name contains (112344_330930.pdf)

const isPdfName = (name: string) => /\.pdf$/i.test(name);

/** Keeps the folder index (see pdf-match.ts) current: rebuilt on a full scan, otherwise only the files the watcher reported. */
function refreshPdfIndex(fullScan: boolean, names: string[]) {
  const dir = pdfDir();
  if (!containsMode() || !dir || !fs.existsSync(dir)) {
    g.__nextaPdfIndex = null;
    return;
  }
  const entry = g.__nextaPdfIndex;
  if (!entry || entry.dir !== dir || fullScan) {
    const index = new FolderIndex();
    for (const name of fs.readdirSync(dir)) if (isPdfName(name)) index.add(name);
    g.__nextaPdfIndex = { index, dir };
    return;
  }
  for (const name of names) {
    if (!isPdfName(name) || name !== path.basename(name)) continue;
    if (fs.existsSync(path.join(dir, name))) entry.index.add(name);
    else entry.index.remove(name);
  }
}

/** Whether any job has this value as its PDF key (lower-case in, matched case-insensitively). */
function knownKeyChecker() {
  const memo = new Map<string, boolean>();
  const lookup = stmt("SELECT 1 FROM jobs WHERE pdf_key = ? COLLATE NOCASE LIMIT 1");
  return (key: string) => {
    let known = memo.get(key);
    if (known === undefined) memo.set(key, (known = lookup.get(key) !== undefined));
    return known;
  };
}

/** Keys of jobs (of any age) that the files the watcher just reported may be for. */
function keysInNewFiles(names: string[]): Set<string> {
  const isKnown = knownKeyChecker();
  const keys = new Set<string>();
  for (const name of names) {
    if (isPdfName(name)) for (const key of allKeysIn(stemOf(name), isKnown)) keys.add(key);
  }
  return keys;
}

/** Keys of jobs (of any age) still without a PDF that a file in the folder contains: catches PDFs that arrived unseen. */
function keysMissingInIndex(): Set<string> {
  const index = g.__nextaPdfIndex?.index;
  const found = new Set<string>();
  if (!index) return found;
  const missing = stmt("SELECT DISTINCT lower(pdf_key) AS k FROM jobs WHERE pdf_ref IS NULL AND pdf_key IS NOT NULL").all() as {
    k: string;
  }[];
  for (const { k } of missing) if (index.filesContaining(k).length > 0) found.add(k);
  return found;
}

type Resolved = { files: string[]; note: string | null };

/**
 * The PDFs for jobs when files are matched by what their name contains. A file
 * counts for a job only if the job's key is a whole piece of its name, and the
 * name isn't also about another job (two patients' numbers in one name can't be
 * trusted for either). Several files for one job are in print order: oldest first.
 */
function containsResolver(dir: string) {
  const index = g.__nextaPdfIndex?.index;
  const isKnown = knownKeyChecker();
  const aboutMemo = new Map<string, string[]>();
  const about = (name: string) => {
    let keys = aboutMemo.get(name);
    if (!keys) aboutMemo.set(name, (keys = keysOf(stemOf(name), isKnown)));
    return keys;
  };
  const timeOf = (name: string) => {
    try {
      return fs.statSync(path.join(dir, name)).mtimeMs;
    } catch {
      return null; // gone
    }
  };
  const baseNames = (ref: string | null) =>
    new Set(
      pdfSources(ref)
        .filter((s) => s.startsWith("file:"))
        .map((s) => path.basename(s.slice(5)).toLowerCase())
    );
  const byPatientId = matchesByPatientId();
  // Who holds which files when this pass starts, so two exams waiting at the same time both get the patient's files
  let held: Map<string, { id: number; names: Set<string> }[]> | null = null;
  const heldBy = (key: string) => {
    if (!held) {
      held = new Map();
      const rows = stmt("SELECT id, lower(pdf_key) AS k, pdf_ref FROM jobs WHERE pdf_ref IS NOT NULL AND pdf_key IS NOT NULL").all() as { id: number; k: string; pdf_ref: string }[];
      for (const r of rows) (held.get(r.k) ?? held.set(r.k, []).get(r.k)!).push({ id: r.id, names: baseNames(r.pdf_ref) });
    }
    return held.get(key) ?? [];
  };

  return (job: { id: number; pdf_key: string | null; pdf_ref: string | null }): Resolved => {
    if (!index || !job.pdf_key) return { files: [], note: null };
    const key = job.pdf_key.toLowerCase();

    const clean: string[] = [];
    const mixed: string[] = [];
    for (const name of index.filesContaining(key)) {
      const keys = about(name);
      if (!keys.includes(key)) continue; // really about a longer key, e.g. "123" inside "AB-123"
      (keys.length > 1 ? mixed : clean).push(name);
    }

    let names = clean;
    let note: string | null = null;

    if (byPatientId) {
      // A patient ID is shared by all of the patient's exams. An exam that already has its report keeps exactly
      // those files (a later file is never added to it, so nothing changes or is sent again). An exam still
      // waiting takes every file with the ID that no other exam already holds, merged together.
      if (job.pdf_ref) {
        const mine = baseNames(job.pdf_ref);
        names = clean.filter((n) => mine.has(n.toLowerCase()));
      } else {
        const taken = new Set(heldBy(key).filter((h) => h.id !== job.id).flatMap((h) => [...h.names]));
        names = clean.filter((n) => !taken.has(n.toLowerCase()));
      }
    }

    if (names.length === 0 && !note && mixed.length > 0) {
      note = `The file name ${mixed[0]} contains more than one patient's number, so it isn't matched automatically.`;
    }

    const dated = names.flatMap((name) => {
      const time = timeOf(name);
      return time === null ? [] : [{ name, time }];
    });
    dated.sort((a, b) => a.time - b.time || a.name.localeCompare(b.name));
    return { files: dated.map((d) => path.join(dir, d.name)), note };
  };
}

/**
 * Rows where `column IN (values)`, queried in chunks: SQLite allows at most
 * 32,766 values per query, and a first sync over a large HL7 folder can name
 * far more patients than that.
 */
function selectIn<T>(sqlBefore: string, column: string, values: (string | number)[], sqlAfter = ""): T[] {
  const CHUNK = 500;
  const rows: T[] = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    const sql = `${sqlBefore} ${column} IN (${chunk.map(() => "?").join(",")}) ${sqlAfter}`;
    rows.push(...(stmt(sql).all(...chunk) as T[]));
  }
  return rows;
}

/**
 * Match jobs to the PDFs in the PDF folder by file name: exactly the expected name,
 * or (the default for accession / patient ID) a name that contains it (all
 * states, so sent/failed jobs show their report too): recent jobs, plus jobs of
 * any age that a new PDF is for. Jobs whose PDF came from ETIAM itself are left
 * alone. Records changed ids in `changed`.
 */
function applyPdfFiles(changed: Set<number>, newPdfKeys: Set<string>) {
  type Row = Pick<JobRow, "id" | "pdf_key" | "pdf_ref" | "pdf_sig" | "pdf_note">;
  const jobs = stmt(
    `SELECT id, pdf_key, pdf_ref, pdf_sig, pdf_note FROM jobs
     WHERE (pdf_ref IS NULL AND first_seen >= ?)
        OR (pdf_ref NOT LIKE '%"etiam:%' AND first_seen >= ?)`
  ).all(daysAgo(ACTIVE_DAYS), daysAgo(PDF_RECHECK_DAYS)) as Row[];

  if (newPdfKeys.size) {
    const older = selectIn<Row>(
      "SELECT id, pdf_key, pdf_ref, pdf_sig, pdf_note FROM jobs WHERE (pdf_ref IS NULL OR pdf_ref NOT LIKE '%\"etiam:%') AND",
      "pdf_key COLLATE NOCASE",
      [...newPdfKeys]
    );
    const seen = new Set(jobs.map((j) => j.id));
    for (const job of older) if (!seen.has(job.id)) jobs.push(job);
  }

  // A name that belongs to two different patients can't safely pick a PDF
  const ambiguous = sharedPdfKeys();
  const filesByKey = new Map<string, { files: string[]; sig: string | null; note: string | null; arrived: string | null }>();
  // A new, replaced or extra file restarts the job's wait before it is sent (ready_at)
  const setPdf = stmt(
    `UPDATE jobs SET pdf_ref = ?, pdf_sig = ?, ready_at = ?, pdf_note = ?,
       pdf_attached_at = CASE WHEN ? IS NULL THEN pdf_attached_at ELSE COALESCE(pdf_attached_at, ?) END,
       pdf_arrived_at = CASE WHEN ? IS NULL THEN pdf_arrived_at ELSE COALESCE(pdf_arrived_at, ?) END
     WHERE id = ?`
  );
  const setNote = stmt("UPDATE jobs SET pdf_note = ? WHERE id = ?");
  const now = new Date().toISOString();
  const dir = pdfDir();
  const resolveContains = containsMode() && dir ? containsResolver(dir) : null;
  const perJob = matchesByPatientId();

  getDb().transaction(() => {
    for (const job of jobs) {
      const key = job.pdf_key?.toLowerCase() ?? "";
      if (ambiguous.has(key)) continue;
      // A patient ID is shared by exams, so what a job gets depends on the job; an accession's files are the same for all its jobs
      const memoKey = resolveContains && perJob ? `${job.id}` : key;
      if (!filesByKey.has(memoKey)) {
        const { files, note } = resolveContains ? resolveContains(job) : { files: pdfFilesFor(job.pdf_key), note: null };
        let sig: string | null = null;
        try {
          // Content fingerprint: tells "the same file name, new content" from "nothing changed"
          sig = files.length ? signFiles(files) : null;
        } catch {
          // A file vanished or is locked while being written; the next event re-checks it
          sig = job.pdf_sig;
        }
        let arrived: string | null = null;
        try {
          // the earliest of its files: when the report reached the folder
          if (files.length) arrived = new Date(Math.min(...files.map((f) => fs.statSync(f).mtimeMs))).toISOString();
        } catch {
          // a file vanished; the next event re-checks it
        }
        filesByKey.set(memoKey, { files, sig, note, arrived });
      }
      const { files, sig: pdf_sig, note, arrived } = filesByKey.get(memoKey)!;
      const pdf_ref = files.length ? JSON.stringify(files.map((f) => `file:${f}`)) : null;
      if (pdf_ref !== job.pdf_ref || pdf_sig !== job.pdf_sig) {
        setPdf.run(pdf_ref, pdf_sig, now, note, pdf_ref, now, pdf_ref, arrived, job.id);
        changed.add(job.id);
      } else if (note !== job.pdf_note) {
        setNote.run(note, job.id);
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
     WHERE state NOT IN ('done','failed') AND first_seen >= ?`
  ).all(daysAgo(ACTIVE_DAYS)) as JobRow[];

  const unfinished = "SELECT * FROM jobs WHERE state NOT IN ('done','failed') AND";
  const older = [
    ...selectIn<JobRow>(unfinished, "accession", [...hl7Keys.accessions]),
    ...selectIn<JobRow>(unfinished, "patient_id", [...hl7Keys.patientIds]),
    ...selectIn<JobRow>(unfinished, "id", [...changed]),
  ];
  const seen = new Set(open.map((j) => j.id));
  for (const job of older) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    open.push(job);
  }
  const findPhone = stmt("SELECT phone FROM hl7_phones WHERE key = ?");
  const lookup = (key: string) => findPhone.get(key) as { phone: string } | undefined;
  const update = stmt(
    "UPDATE jobs SET whatsapp_num = ?, phone_source = ?, country_code = ?, state = ?, ready_at = ? WHERE id = ?"
  );
  const now = new Date().toISOString();

  getDb().transaction(() => {
    for (const job of open) {
      // The sender owns a job until it records the outcome
      if (job.state === "sending") continue;

      let { whatsapp_num, phone_source, country_code } = job;
      if (phone_source !== "manual") {
        // Accession is more specific than patient ID, so it wins when both exist
        // (but never a placeholder accession like "XXXX", shared by many patients)
        const hit =
          (usableAccession(job.accession) ? lookup(`acc:${job.accession}`) : undefined) ??
          (job.patient_id ? lookup(`pid:${job.patient_id}`) : undefined);
        if (hit) {
          // "+44…" carries its own country; anything else is taken as Egyptian
          country_code = detectCountry(hit.phone) ?? DEFAULT_COUNTRY_CODE;
          const normalized = normalizePhone(hit.phone, country_code);
          // A number that doesn't validate is kept as received, so staff can see what HL7 sent
          whatsapp_num = normalized.ok ? normalized.stored : hit.phone;
          phone_source = "hl7";
        }
      }

      const next = deriveState({ state: job.state, whatsapp_num, pdf_ref: job.pdf_ref, country_code, bad_number: job.bad_number });
      // The wait before auto-sending counts from the last change: a new number, or becoming ready
      let ready_at = job.ready_at;
      if (whatsapp_num !== job.whatsapp_num || (next === "send" && job.state !== "send")) ready_at = now;
      if (
        whatsapp_num !== job.whatsapp_num ||
        phone_source !== job.phone_source ||
        country_code !== job.country_code ||
        next !== job.state ||
        ready_at !== job.ready_at
      ) {
        update.run(whatsapp_num, phone_source, country_code, next, ready_at, job.id);
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
  const HL7_DIR = hl7Dir();
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
