// Server settings: entered on the Settings page and stored in nexta.db, so each
// new server is set up in the app. Anything not saved there falls back to .env,
// then to the built-in default. (NEXTA_DB_PATH stays in .env: it's needed to
// find the database these settings live in.)
import { stmt } from "@/lib/nexta-db";

export type ConfigKey = "etiamDbPath" | "pdfDir" | "hl7Dir" | "pdfName" | "debug";
export type ConfigSource = "saved" | "env" | "default";

export type Config = {
  /** ETIAM's print database (opened read-only) */
  etiamDbPath: string;
  /** Folder the PDFs land in; "" = only use PDFs stored inside ETIAM */
  pdfDir: string;
  /** Folder with incoming HL7 messages */
  hl7Dir: string;
  /** PDF file name pattern, e.g. "{accession}" → 330930.pdf, 330930_2.pdf */
  pdfName: string;
  /** Log what triggered each sync and how long it took */
  debug: boolean;
};

const ENV_NAMES: Record<ConfigKey, string> = {
  etiamDbPath: "ETIAM_DB_PATH",
  pdfDir: "PDF_DIR",
  hl7Dir: "HL7_DIR",
  pdfName: "PDF_NAME",
  debug: "NEXTA_DEBUG",
};

export const CONFIG_DEFAULTS: Record<ConfigKey, string> = {
  etiamDbPath: "C:\\ProgramData\\Etiam\\DcmPRI\\StorePrint\\sqlite.db",
  pdfDir: "E:\\pdf",
  hl7Dir: "E:\\pdfsend\\hl7",
  pdfName: "{accession}",
  debug: "0",
};

/** The naming choices offered on the Settings page (anything else is "custom"). */
export const PDF_NAME_PRESETS = [
  { value: "{accession}", label: "Accession number", example: "330930.pdf" },
  { value: "@{jobuid}", label: "ETIAM job ID", example: "@1-2-250-1-59-847-…-81998.pdf" },
  { value: "{name}", label: "Patient name", example: "AHMED SAMY FOUAD.pdf" },
];

/** Placeholders a PDF name pattern may use. */
export const PDF_NAME_FIELDS = ["{accession}", "{jobuid}", "{jobuid_raw}", "{patientid}", "{name}"];

let cache: { config: Config; sources: Record<ConfigKey, ConfigSource> } | null = null;

function load() {
  const saved = new Map(
    (stmt("SELECT key, value FROM settings").all() as { key: string; value: string }[]).map((r) => [r.key, r.value])
  );
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
  return {
    config: {
      etiamDbPath: raw.etiamDbPath.trim(),
      pdfDir: raw.pdfDir.trim(),
      hl7Dir: raw.hl7Dir.trim(),
      pdfName: raw.pdfName.trim() || CONFIG_DEFAULTS.pdfName,
      debug: raw.debug === "1" || raw.debug === "true",
    },
    sources,
  };
}

/** Current settings (cached; refreshed by saveConfig). */
export function getConfig(): Config {
  return (cache ??= load()).config;
}

export function getConfigSources(): Record<ConfigKey, ConfigSource> {
  return (cache ??= load()).sources;
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
  cache = null;
}

/** What each setting falls back to when nothing is saved here: .env, else the default. */
export function getConfigFallbacks(): Record<ConfigKey, string> {
  const out = {} as Record<ConfigKey, string>;
  for (const key of Object.keys(ENV_NAMES) as ConfigKey[]) {
    out[key] = process.env[ENV_NAMES[key]] ?? CONFIG_DEFAULTS[key];
  }
  return out;
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
