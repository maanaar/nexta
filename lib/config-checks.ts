// Checks for the Settings page: does each path / the PDF naming actually work
// on this server? Read-only: nothing is created or changed.
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { WHATSAPP_API_VERSION, checkPdfNamePattern } from "@/lib/config";
import { pdfKeyFor, stmt, type JobRow } from "@/lib/nexta-db";

export type CheckResult = { ok: boolean; message: string };

const REQUIRED_COLUMNS = [
  "pjb_StudyDate",
  "pjb_PatientsName",
  "pjb_AccessionNumber",
  "pjb_PatientID",
  "pjb_Modality",
  "pjb_StudyDescription",
  "pjb_JobUID",
];

export function checkEtiamDb(file: string): CheckResult {
  if (!file) return { ok: false, message: "Enter the path to ETIAM's sqlite.db" };
  if (!fs.existsSync(file)) return { ok: false, message: "No file at this path" };
  if (!fs.statSync(file).isFile()) return { ok: false, message: "This is a folder; enter the path to the sqlite.db file" };
  let db: Database.Database | null = null;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true, timeout: 5000 });
    const columns = (db.prepare("PRAGMA table_info(PrintJob)").all() as { name: string }[]).map((c) => c.name);
    if (columns.length === 0) return { ok: false, message: "This database has no PrintJob table; is it ETIAM's?" };
    const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
    if (missing.length) return { ok: false, message: `PrintJob is missing columns: ${missing.join(", ")}` };
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM PrintJob").get() as { n: number };
    return { ok: true, message: `ETIAM database found: ${n} print job${n === 1 ? "" : "s"} in PrintJob` };
  } catch (err: any) {
    return { ok: false, message: `Can't open it: ${err.message}` };
  } finally {
    db?.close();
  }
}

export function checkFolder(dir: string, kind: "pdf" | "hl7"): CheckResult {
  if (!dir) {
    return kind === "pdf"
      ? { ok: true, message: "Not used: only PDFs stored inside ETIAM are used" }
      : { ok: false, message: "Enter the HL7 folder" };
  }
  if (!fs.existsSync(dir)) return { ok: false, message: "No folder at this path" };
  if (!fs.statSync(dir).isDirectory()) return { ok: false, message: "This is a file, not a folder" };
  try {
    const names = fs.readdirSync(dir);
    const count = kind === "pdf" ? names.filter((n) => /\.pdf$/i.test(n)).length : names.length;
    return { ok: true, message: `Folder found: ${count.toLocaleString()} ${kind === "pdf" ? "PDF" : "HL7"} file${count === 1 ? "" : "s"}` };
  } catch (err: any) {
    return { ok: false, message: `Can't read it: ${err.message}` };
  }
}

/**
 * Asks Meta about the phone number ID with the token, which proves both work
 * without sending anything. Read-only.
 */
export async function checkWhatsApp(phoneNumberId: string, token: string, template: string): Promise<CheckResult> {
  if (!phoneNumberId && !token && !template) {
    return { ok: true, message: "Not set up: WhatsApp sending stays off" };
  }
  if (!phoneNumberId) return { ok: false, message: "Enter the WhatsApp phone number ID" };
  if (!token) return { ok: false, message: "Enter the WhatsApp access token" };
  try {
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    const body = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string;
      verified_name?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, message: `Meta refused it (HTTP ${res.status}): ${body.error?.message ?? "unknown error"}` };
    }
    const who = [body.verified_name, body.display_phone_number].filter(Boolean).join(" · ");
    const connected = `Connected to WhatsApp${who ? `: ${who}` : ""}`;
    return template
      ? { ok: true, message: connected }
      : { ok: false, message: `${connected}. Enter the template name too` };
  } catch (err: any) {
    return { ok: false, message: `Can't reach Meta: ${err.message}` };
  }
}

/**
 * Tries a PDF naming pattern on the most recent jobs and reports how many have
 * a matching file, so the right naming can be picked before saving.
 */
export function checkPdfNaming(pattern: string, dir: string): CheckResult {
  const problem = checkPdfNamePattern(pattern);
  if (problem) return { ok: false, message: problem };
  if (!dir || !fs.existsSync(dir)) return { ok: true, message: "Pattern is valid (no PDF folder to try it on)" };

  const jobs = stmt(
    "SELECT job_uid, accession, patient_id, patient_name FROM jobs ORDER BY first_seen DESC, id DESC LIMIT 50"
  ).all() as Pick<JobRow, "job_uid" | "accession" | "patient_id" | "patient_name">[];
  if (jobs.length === 0) return { ok: true, message: "Pattern is valid (no jobs yet to try it on)" };

  let matched = 0;
  let example = "";
  for (const job of jobs) {
    const key = pdfKeyFor(job, pattern);
    if (!key) continue;
    example ||= `${key}.pdf`;
    if (fs.existsSync(path.join(dir, `${key}.pdf`)) || fs.existsSync(path.join(dir, `${key}_2.pdf`))) matched++;
  }
  const summary = `${matched} of the last ${jobs.length} jobs have a matching PDF${example ? ` (e.g. ${example})` : ""}`;
  return { ok: matched > 0, message: matched > 0 ? summary : `${summary}. Is this the naming your PDFs use?` };
}
