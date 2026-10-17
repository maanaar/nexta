// Server settings: entered on the Settings page and stored in nexta.db, so each
// new server is set up in the app. Anything not saved there falls back to .env,
// then to the built-in default. (NEXTA_DB_PATH stays in .env: it's needed to
// find the database these settings live in.)
import path from "path";
import { pdfKeyFor, stmt, type JobRow } from "@/lib/nexta-db";

export type ConfigKey =
  | "etiamDbPath"
  | "pdfMatch"
  | "pdfInDir"
  | "gsPath"
  | "compressMinMb"
  | "pdfDir"
  | "hl7Dir"
  | "pdfName"
  | "debug"
  | "autoSend"
  | "sendFromDate"
  | "compressFromDate"
  | "sendDelaySeconds"
  | "waPhoneNumberId"
  | "waToken"
  | "waTemplate"
  | "waLang"
  | "waDryRun";
export type ConfigSource = "saved" | "env" | "default";

export type Config = {
  /** ETIAM's print database (opened read-only) */
  etiamDbPath: string;
  /** Folder the PDFs are first written to, before compression; "" = no compression step */
  pdfInDir: string;
  /** Path to Ghostscript (gswin64c.exe); "" = look for it */
  gsPath: string;
  /** Only PDFs larger than this many MB are compressed; smaller ones are copied as they are */
  compressMinMb: number;
  /** Folder the PDFs land in (after compression, when that is used); "" = only use PDFs stored inside ETIAM */
  pdfDir: string;
  /** Folder with incoming HL7 messages */
  hl7Dir: string;
  /** PDF file name pattern, e.g. "{accession}" → 330930.pdf, 330930_2.pdf */
  pdfName: string;
  /**
   * "contains": a PDF belongs to a job when its name contains the job's accession / patient ID
   * as a whole piece (112344_330930.pdf). "exact": the name must be exactly that (330930.pdf,
   * 330930_2.pdf). Only applies when PDFs are found by accession or patient ID.
   */
  pdfMatch: "contains" | "exact";
  /** Log what triggered each sync and how long it took */
  debug: boolean;
  /** Send ready reports over WhatsApp on their own (otherwise only the Send button sends) */
  autoSend: boolean;
  /** "YYYY-MM-DD": only jobs whose study date is on/after this are ever sent. "" = none are. */
  sendFromDate: string;
  /** PDFs in the before-compression folder last modified before this day are left alone; "" = all of them */
  compressFromDate: string;
  /** Wait this long after a job's last change (PDF / phone) before auto-sending it */
  sendDelaySeconds: number;
  /** Meta WhatsApp Business phone number id */
  waPhoneNumberId: string;
  /** Meta access token. A secret: never sent back to the browser (see publicConfig) */
  waToken: string;
  /** Approved message template that carries the PDF as its document header */
  waTemplate: string;
  /** Template language code, e.g. "ar" */
  waLang: string;
  /** Log what would be sent instead of calling Meta (for testing a server) */
  waDryRun: boolean;
};

const ENV_NAMES: Record<ConfigKey, string> = {
  etiamDbPath: "ETIAM_DB_PATH",
  pdfInDir: "PDF_IN_DIR",
  gsPath: "GS_PATH",
  compressMinMb: "COMPRESS_MIN_MB",
  pdfDir: "PDF_DIR",
  hl7Dir: "HL7_DIR",
  pdfName: "PDF_NAME",
  pdfMatch: "PDF_MATCH",
  debug: "NEXTA_DEBUG",
  autoSend: "AUTO_SEND",
  sendFromDate: "SEND_FROM_DATE",
  compressFromDate: "COMPRESS_FROM_DATE",
  sendDelaySeconds: "SEND_DELAY_SECONDS",
  waPhoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
  waToken: "WHATSAPP_TOKEN",
  waTemplate: "WHATSAPP_TEMPLATE",
  waLang: "WHATSAPP_LANG",
  waDryRun: "WHATSAPP_DRY_RUN",
};

export const CONFIG_DEFAULTS: Record<ConfigKey, string> = {
  etiamDbPath: "C:\\ProgramData\\Etiam\\DcmPRI\\StorePrint\\sqlite.db",
  pdfInDir: "",
  gsPath: "",
  compressMinMb: "2",
  pdfDir: "E:\\pdf",
  hl7Dir: "E:\\pdfsend\\hl7",
  pdfName: "{accession}",
  pdfMatch: "contains",
  debug: "0",
  autoSend: "0",
  sendFromDate: "",
  compressFromDate: "",
  sendDelaySeconds: "120",
  waPhoneNumberId: "",
  waToken: "",
  waTemplate: "",
  waLang: "ar",
  waDryRun: "0",
};

/** The naming choices offered on the Settings page (anything else is "custom"). */
export const PDF_NAME_PRESETS = [
  { value: "{accession}", label: "Accession number", example: "330930.pdf" },
  { value: "{patientid}", label: "Patient ID", example: "102440.pdf" },
  { value: "@{jobuid}", label: "ETIAM job ID", example: "@1-2-250-1-59-847-…-81998.pdf" },
  { value: "{name}", label: "Patient name", example: "AHMED SAMY FOUAD.pdf" },
];

/** Placeholders a PDF name pattern may use. */
export const PDF_NAME_FIELDS = ["{accession}", "{jobuid}", "{jobuid_raw}", "{patientid}", "{name}"];

export const MAX_SEND_DELAY_SECONDS = 3600;
export const MAX_COMPRESS_MIN_MB = 1000;

/** Meta Graph API version used for every WhatsApp call */
export const WHATSAPP_API_VERSION = "v25.0";

// On globalThis: instrumentation (the watchers) and the API routes are bundled
// separately, and a save in one must be seen by the other
type Cache = { config: Config; sources: Record<ConfigKey, ConfigSource> };
const g = globalThis as typeof globalThis & { __nextaConfig?: Cache | null };

const isTrue = (v: string) => v === "1" || v.toLowerCase() === "true";

/** `overrides` (string = set, null = removed) lets a save be checked before it is stored. */
function load(overrides: Partial<Record<ConfigKey, string | null>> = {}) {
  const saved = new Map(
    (stmt("SELECT key, value FROM settings").all() as { key: string; value: string }[]).map((r) => [r.key, r.value])
  );
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    if (value === null) saved.delete(key);
    else saved.set(key, value);
  }
  const raw = {} as Record<ConfigKey, string>;
  const sources = {} as Record<ConfigKey, ConfigSource>;
  for (const key of Object.keys(ENV_NAMES) as ConfigKey[]) {
    const env = process.env[ENV_NAMES[key]];
    if (saved.has(key)) {
      raw[key] = saved.get(key)!;
      sources[key] = "saved";
    } else if (env !== undefined) {
      raw[key] = env;
      sources[key] = "env";
    } else {
      raw[key] = CONFIG_DEFAULTS[key];
      sources[key] = "default";
    }
  }
  const delay = Number.parseInt(raw.sendDelaySeconds, 10);
  const minMb = Number.parseFloat(raw.compressMinMb);
  return {
    config: {
      etiamDbPath: raw.etiamDbPath.trim(),
      pdfInDir: raw.pdfInDir.trim(),
      gsPath: raw.gsPath.trim(),
      compressMinMb: Number.isFinite(minMb)
        ? Math.min(Math.max(minMb, 0), MAX_COMPRESS_MIN_MB)
        : Number(CONFIG_DEFAULTS.compressMinMb),
      pdfDir: raw.pdfDir.trim(),
      hl7Dir: raw.hl7Dir.trim(),
      pdfName: raw.pdfName.trim() || CONFIG_DEFAULTS.pdfName,
      pdfMatch: raw.pdfMatch.trim().toLowerCase() === "exact" ? ("exact" as const) : ("contains" as const),
      debug: isTrue(raw.debug),
      autoSend: isTrue(raw.autoSend),
      sendFromDate: isValidDate(raw.sendFromDate.trim()) ? raw.sendFromDate.trim() : "",
      compressFromDate: isValidDate(raw.compressFromDate.trim()) ? raw.compressFromDate.trim() : "",
      sendDelaySeconds: Number.isFinite(delay)
        ? Math.min(Math.max(delay, 0), MAX_SEND_DELAY_SECONDS)
        : Number(CONFIG_DEFAULTS.sendDelaySeconds),
      waPhoneNumberId: raw.waPhoneNumberId.trim(),
      waToken: raw.waToken.trim(),
      waTemplate: raw.waTemplate.trim(),
      waLang: raw.waLang.trim() || CONFIG_DEFAULTS.waLang,
      waDryRun: isTrue(raw.waDryRun),
    } satisfies Config,
    sources,
  };
}

/** Current settings (cached; refreshed by saveConfig). */
export function getConfig(): Config {
  return (g.__nextaConfig ??= load()).config;
}

export function getConfigSources(): Record<ConfigKey, ConfigSource> {
  return (g.__nextaConfig ??= load()).sources;
}

/** The settings as they would be after saving `values`, without saving anything. */
export function previewConfig(values: Partial<Record<ConfigKey, string | null>>): Config {
  return load(values).config;
}

/**
 * Settings that are safe to hand to the browser: the WhatsApp token is replaced
 * by `waTokenSet`, so it can be entered but never read back.
 */
export function publicConfig(config: Config = getConfig()) {
  const { waToken, ...rest } = config;
  return { ...rest, waTokenSet: waToken !== "" };
}

/**
 * Saves settings from the Settings page. A value of null removes the saved
 * value, so .env / the default applies again.
 */
export function saveConfig(values: Partial<Record<ConfigKey, string | null>>) {
  const upsert = stmt("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const remove = stmt("DELETE FROM settings WHERE key = ?");
  for (const [key, value] of Object.entries(values) as [ConfigKey, string | null | undefined][]) {
    if (!(key in ENV_NAMES) || value === undefined) continue;
    if (value === null) remove.run(key);
    else upsert.run(key, value);
  }
  g.__nextaConfig = null;
}

/** What each setting falls back to when nothing is saved here: .env, else the default. */
export function getConfigFallbacks(): Record<ConfigKey, string> {
  const out = {} as Record<ConfigKey, string>;
  for (const key of Object.keys(ENV_NAMES) as ConfigKey[]) {
    out[key] = process.env[ENV_NAMES[key]] ?? CONFIG_DEFAULTS[key];
  }
  // Same rule as publicConfig: the secret never leaves the server
  out.waToken = "";
  return out;
}

/** A key shorter than this is too easy to find by accident inside a name (a print number like _2) to match on. */
export const MIN_CONTAINS_KEY_LENGTH = 4;

/**
 * Whether PDFs are matched by their name *containing* the job's accession / patient ID.
 * Finding PDFs by patient ID is always like this: an exact name would hand the same
 * file to every one of the patient's exams (see containsResolver in etiam-sync.ts).
 */
export function containsMode(c: Pick<Config, "pdfMatch" | "pdfName"> = getConfig()): boolean {
  return c.pdfName === "{patientid}" || (c.pdfMatch === "contains" && c.pdfName === "{accession}");
}

/** The patient ID is shared by all of a patient's exams, so a PDF found by it needs extra care. */
/** True when reports are looked for by accession number, so a print job without one can never get its report. */
export function usesAccession(c: Pick<Config, "pdfName"> = getConfig()): boolean {
  return c.pdfName.includes("{accession}");
}

export function matchesByPatientId(c: Pick<Config, "pdfName"> = getConfig()): boolean {
  return c.pdfName === "{patientid}";
}

type KeyJob = Pick<JobRow, "job_uid" | "accession" | "patient_id" | "patient_name">;

/**
 * The value a job's PDF is found by under the current settings, or null when it
 * can't be used: empty, a placeholder like "XXXX", or (when matching by what the
 * name contains) too short to match safely.
 */
export function jobPdfKey(job: KeyJob, c: Config = getConfig()): string | null {
  const key = pdfKeyFor(job, c.pdfName);
  if (key && containsMode(c) && key.length < MIN_CONTAINS_KEY_LENGTH) return null;
  return key;
}

/** Problems with a PDF name pattern, or null if it's usable. */
export function checkPdfNamePattern(pattern: string): string | null {
  if (!pattern.trim()) return "Enter a pattern, e.g. {accession}";
  const fields = pattern.match(/\{[^}]*\}/g) ?? [];
  if (fields.length === 0) return "The pattern must contain at least one field, e.g. {accession}";
  const unknown = fields.find((f) => !PDF_NAME_FIELDS.includes(f));
  if (unknown) return `Unknown field ${unknown}. Use ${PDF_NAME_FIELDS.join(", ")}`;
  if (/[\\/:*?"<>|]/.test(pattern.replace(/\{[^}]*\}/g, ""))) return "The pattern can't contain \\ / : * ? \" < > |";
  if (/\.pdf$/i.test(pattern)) return "Leave out .pdf; it's added automatically";
  return null;
}

const samePath = (a: string, b: string) =>
  path.resolve(a).replace(/[\\/]+$/, "").toLowerCase() === path.resolve(b).replace(/[\\/]+$/, "").toLowerCase();

/** Problems with the compression folders, or null if they're usable (or compression is off). */
export function checkCompressionSettings(c: Config): string | null {
  if (!c.pdfInDir) return null;
  if (!c.pdfDir) return "Also set the PDF folder after compression: compressed files are saved there.";
  if (samePath(c.pdfInDir, c.pdfDir)) {
    return "The folder before compression and the folder after must be two different folders.";
  }
  return null;
}

/** A real calendar date written "YYYY-MM-DD". */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Problems that would make automatic sending unsafe or impossible, or null if the settings are fine. */
export function checkSendSettings(c: Config): string | null {
  if (!c.autoSend) return null;
  if (!c.sendFromDate) {
    return "Pick the date to start sending from first. Older reports are never sent, so nothing from before go-live goes out by accident.";
  }
  if (!c.waDryRun) {
    if (!c.waPhoneNumberId) return "Enter the WhatsApp phone number ID to turn on automatic sending.";
    if (!c.waToken) return "Enter the WhatsApp access token to turn on automatic sending.";
    if (!c.waTemplate) return "Enter the WhatsApp template name to turn on automatic sending.";
  }
  return null;
}

/**
 * Whether a job's report may be sent over WhatsApp at all: its study date
 * ("YYYY-MM-DD", as stored in jobs.study_date) must be on or after the start
 * date. With no start date set, nothing is eligible.
 */
export function sendEligible(studyDate: string | null | undefined, c: Config = getConfig()): boolean {
  if (!c.sendFromDate || !studyDate) return false;
  return /^\d{4}-\d{2}-\d{2}/.test(studyDate) && studyDate.slice(0, 10) >= c.sendFromDate;
}
