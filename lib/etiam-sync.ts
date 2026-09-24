// Pulls ETIAM print jobs and HL7 phone numbers into nexta.db, and tells open
// dashboards when something changed.
import Database from "better-sqlite3";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { deriveState, getDb, type JobRow } from "@/lib/nexta-db";

const ETIAM_DB_PATH = process.env.ETIAM_DB_PATH || "C:\\ProgramData\\Etiam\\DcmPRI\\StorePrint\\sqlite.db";
const HL7_DIR = process.env.HL7_DIR || "E:\\pdfsend\\hl7";
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
  watchers: fs.FSWatcher[];
  debounce: NodeJS.Timeout | null;
  events: EventEmitter;
};
const g = globalThis as typeof globalThis & { __nextaSync?: SyncState };
const state: SyncState = (g.__nextaSync ??= {
  status: { lastSync: null, lastChange: null, watching: false, etiamError: null, hl7Error: null },
  running: null,
  lastRun: 0,
  started: false,
  watchers: [],
  debounce: null,
  events: new EventEmitter().setMaxListeners(0),
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
 * Subscribes to OS file-change events for the ETIAM database and the HL7
 * folder, so a sync runs the moment ETIAM writes. Nothing polls ETIAM.
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
    if (state.watchers.length < 2) attachWatchers();
  }, FULL_SYNC_MS);
}

function attachWatchers() {
  state.watchers.forEach((w) => w.close());
  state.watchers = [];

  // Watch ETIAM's folder, not the file: SQLite also writes -wal/-journal files next to it
  const etiamDir = path.dirname(ETIAM_DB_PATH);
  const etiamFile = path.basename(ETIAM_DB_PATH);
  watch(etiamDir, (file) => !file || file.startsWith(etiamFile));
  watch(HL7_DIR, () => true);
}

function watch(dir: string, relevant: (file: string | null) => boolean) {
  try {
    const watcher = fs.watch(dir, (_event, file) => {
      if (relevant(file ? file.toString() : null)) scheduleSync();
    });
    watcher.on("error", (err) => {
      console.error(`Stopped watching ${dir}:`, err.message);
      state.watchers = state.watchers.filter((w) => w !== watcher);
    });
    state.watchers.push(watcher);
    console.log(`Watching ${dir} for changes`);
  } catch (err: any) {
    console.error(`Can't watch ${dir} (will retry):`, err.message);
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
    state.status.hl7Error = null;
  } catch (err: any) {
    state.status.hl7Error = err.message;
    console.error("HL7 import failed:", err);
  }

  try {
    changes += importEtiamJobs();
    state.status.etiamError = null;
  } catch (err: any) {
    state.status.etiamError = err.message;
    console.error("ETIAM import failed:", err);
  }

  changes += applyHl7Phones();
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
};

/** Returns how many jobs were added or changed. */
function importEtiamJobs() {
  // Read-only, and wait (instead of failing) if ETIAM is mid-write
  const etiam = new Database(ETIAM_DB_PATH, { readonly: true, fileMustExist: true, timeout: 5000 });
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
    INSERT INTO jobs (job_uid, patient_name, patient_id, accession, modality, study_desc, study_date, state, first_seen)
    VALUES (@job_uid, @patient_name, @patient_id, @accession, @modality, @study_desc, @study_date, 'no_number', @first_seen)
    ON CONFLICT(job_uid) DO UPDATE SET
      patient_name = excluded.patient_name,
      patient_id   = excluded.patient_id,
      accession    = excluded.accession,
      modality     = excluded.modality,
      study_desc   = excluded.study_desc,
      study_date   = excluded.study_date
    -- Skip no-op updates, so the change count only reflects real changes
    WHERE jobs.patient_name IS NOT excluded.patient_name
       OR jobs.patient_id   IS NOT excluded.patient_id
       OR jobs.accession    IS NOT excluded.accession
       OR jobs.modality     IS NOT excluded.modality
       OR jobs.study_desc   IS NOT excluded.study_desc
       OR jobs.study_date   IS NOT excluded.study_date
  `);

  const now = new Date().toISOString();
  let changes = 0;
  getDb().transaction(() => {
    for (const row of rows) {
      const jobUid = row.pjb_JobUID?.trim();
      if (!jobUid) continue;
      changes += insert.run({
        job_uid: jobUid,
        patient_name: (row.pjb_PatientsName || "").replace(/\^+/g, " ").trim(),
        patient_id: (row.pjb_PatientID || "").trim(),
        accession: (row.pjb_AccessionNumber || "").trim(),
        modality: (row.pjb_Modality || "").trim(),
        study_desc: (row.pjb_StudyDescription || "").trim(),
        study_date: formatStudyDate(row.pjb_StudyDate),
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

/**
 * Give unfinished jobs the phone number HL7 has for them. Numbers typed in by
 * hand are never replaced. Returns how many jobs changed.
 */
function applyHl7Phones() {
  const db = getDb();
  const open = db
    .prepare("SELECT * FROM jobs WHERE state NOT IN ('done','failed','no_whatsapp','signed_out')")
    .all() as JobRow[];
  const findPhone = db.prepare("SELECT phone FROM hl7_phones WHERE key = ?");
  const lookup = (key: string) => findPhone.get(key) as { phone: string } | undefined;
  const update = db.prepare("UPDATE jobs SET whatsapp_num = ?, phone_source = ?, state = ? WHERE id = ?");

  let changes = 0;
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

      const next = deriveState({ state: job.state, whatsapp_num });
      if (whatsapp_num !== job.whatsapp_num || phone_source !== job.phone_source || next !== job.state) {
        update.run(whatsapp_num, phone_source, next, job.id);
        changes++;
      }
    }
  })();
  return changes;
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
