/* lib/patient-data.ts */
import path from "path";
import { MIN_CONTAINS_KEY_LENGTH, containsMode, getConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { changedAfterSent, pdfSources, type JobRow } from "@/lib/nexta-db";
import { DEFAULT_COUNTRY_CODE, normalizePhone, toNational } from "@/lib/phone";
import { sendBlockedReason } from "@/lib/send-rules";

export type PatientRecord = {
  id: number;
  patientName: string;
  /** The number as stored (+201012345678 once valid), or "N/A" */
  whatsappNum: string;
  /** What to show for editing next to the country: 01012345678 */
  phoneNational: string;
  /** Dialling code of the number's country, e.g. "20" */
  countryCode: string;
  /** The number can be sent to */
  phoneValid: boolean;
  phoneSource: "hl7" | "manual" | null;
  modality: string;
  studyDesc: string;
  accessionNum: string;
  patientId: string;
  createdOn: string;
  reportCreationDate: string;
  /** ISO times for the screens (they format them in 12-hour time and work out waits) */
  receivedAt: string;
  /** When the report was first connected to this exam; null while it is still waiting */
  reportAt: string | null;
  /** When it was sent; null until then */
  sentAtIso: string | null;
  /** The exam's study date, YYYY-MM-DD */
  studyDate: string;
  sentAt: string;
  timer: string;
  state: string;
  /**
   * Empty until a PDF has been found. One entry per file (330930.pdf,
   * 330930_2.pdf, …), preceded by a merged "All pages" entry when there are several.
   */
  pdfs: { label: string; url: string }[];
  /** Why no PDF can be matched automatically, if there's a reason */
  pdfBlockedReason: string | null;
  /** What this job is waiting for, e.g. "330930.pdf" or "a PDF with 330930 in its name" */
  pdfExpectedName: string | null;
  /** Why the Send button is off (in words for staff), or null when this can be sent now */
  sendBlockedReason: string | null;
  /** "Send on WhatsApp", "Resend" or "Retry" */
  sendLabel: string;
  /** The report's PDF changed after it was sent */
  changedAfterSent: boolean;
  /** Why the last send failed, if it did */
  lastError: string | null;
};


// Time from when Nexta first saw the print job until it was sent (or now)
function calculateTimer(start: string, end: string | null) {
  const diff = Math.max(0, (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return [hours, minutes, seconds].map((n) => n.toString().padStart(2, "0")).join(":");
}

function pdfList(job: JobRow): PatientRecord["pdfs"] {
  const sources = pdfSources(job.pdf_ref);
  const files = sources.map((source, n) => ({
    // The file name, so staff can see which file was matched
    label: source.startsWith("file:") ? path.win32.basename(source.slice(5)) : "From ETIAM",
    url: `/api/admin/patients/${job.id}/pdf?n=${n}`,
  }));
  if (files.length < 2) return files;
  return [{ label: `All pages (${files.length} files)`, url: `/api/admin/patients/${job.id}/pdf?n=all` }, ...files];
}

function pdfBlockedReason(job: JobRow, shared: Set<string>): string | null {
  if (job.pdf_ref) return null;
  if (!job.pdf_key) {
    const cfg = getConfig();
    const short = containsMode(cfg)
      ? ` or shorter than ${MIN_CONTAINS_KEY_LENGTH} characters (too short to find safely inside a file name)`
      : "";
    return `No PDF can be looked for from this job's details (PDF naming "${cfg.pdfName}"): a value it needs is empty, a placeholder like "XXXX"${short}, so its PDF can't be matched automatically.`;
  }
  if (shared.has(job.pdf_key.toLowerCase())) {
    return `The value "${job.pdf_key}" belongs to more than one patient, so a PDF isn't matched to it automatically.`;
  }
  // A file was found but can't be trusted for this job (several patients' numbers in its name, several exams waiting)
  return job.pdf_note;
}

/** What the job is waiting for, in words: "330930.pdf", or "a PDF with 330930 in its name". */
function pdfWaitingFor(job: JobRow): string | null {
  if (!job.pdf_key) return null;
  return containsMode() ? `a PDF with ${job.pdf_key} in its name` : `${job.pdf_key}.pdf`;
}

export function toPatientRecord(job: JobRow, shared: Set<string> = new Set()): PatientRecord {
  const countryCode = job.country_code || DEFAULT_COUNTRY_CODE;
  const number = job.whatsapp_num ? normalizePhone(job.whatsapp_num, countryCode) : null;
  return {
    id: job.id,
    patientName: job.patient_name || "Unknown patient",
    whatsappNum: job.whatsapp_num || "N/A",
    phoneNational: !job.whatsapp_num ? "" : number?.ok ? toNational(number.phone, countryCode) : job.whatsapp_num,
    countryCode,
    phoneValid: !!number?.ok,
    phoneSource: job.phone_source,
    modality: job.modality || "N/A",
    studyDesc: job.study_desc || "N/A",
    accessionNum: job.accession || "N/A",
    patientId: job.patient_id || "N/A",
    createdOn: job.study_date || "N/A",
    reportCreationDate: formatDateTime(job.first_seen),
    receivedAt: job.first_seen,
    reportAt: job.pdf_attached_at,
    sentAtIso: job.sent_at,
    studyDate: job.study_date,
    sentAt: formatDateTime(job.sent_at),
    timer: calculateTimer(job.first_seen, job.sent_at),
    state: job.state,
    pdfs: pdfList(job),
    pdfBlockedReason: pdfBlockedReason(job, shared),
    pdfExpectedName: pdfWaitingFor(job),
    sendBlockedReason: sendBlockedReason(job),
    sendLabel: job.state === "failed" ? "Retry" : job.state === "done" ? "Resend" : "Send on WhatsApp",
    changedAfterSent: changedAfterSent(job),
    lastError: job.last_error,
  };
}
