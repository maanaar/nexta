/* lib/patient-data.ts */
import path from "path";
import { getConfig } from "@/lib/config";
import { pdfSources, type JobRow } from "@/lib/nexta-db";

export type PatientRecord = {
  id: number;
  patientName: string;
  whatsappNum: string;
  phoneSource: "hl7" | "manual" | null;
  modality: string;
  studyDesc: string;
  accessionNum: string;
  patientId: string;
  createdOn: string;
  reportCreationDate: string;
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
  /** The PDF file name this job is waiting for, e.g. "330930.pdf" */
  pdfExpectedName: string | null;
};

function formatDateTime(iso: string | null) {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
    return `No PDF file name can be built from this job's details (PDF naming "${getConfig().pdfName}"): a value it needs is empty or a placeholder like "XXXX", so its PDF can't be matched automatically.`;
  }
  if (shared.has(job.pdf_key.toLowerCase())) {
    return `The file name "${job.pdf_key}.pdf" would belong to more than one patient, so it isn't matched automatically.`;
  }
  return null;
}

export function toPatientRecord(job: JobRow, shared: Set<string> = new Set()): PatientRecord {
  return {
    id: job.id,
    patientName: job.patient_name || "Unknown patient",
    whatsappNum: job.whatsapp_num || "N/A",
    phoneSource: job.phone_source,
    modality: job.modality || "N/A",
    studyDesc: job.study_desc || "N/A",
    accessionNum: job.accession || "N/A",
    patientId: job.patient_id || "N/A",
    createdOn: job.study_date || "N/A",
    reportCreationDate: formatDateTime(job.first_seen),
    sentAt: formatDateTime(job.sent_at),
    timer: calculateTimer(job.first_seen, job.sent_at),
    state: job.state,
    pdfs: pdfList(job),
    pdfBlockedReason: pdfBlockedReason(job, shared),
    pdfExpectedName: job.pdf_key ? `${job.pdf_key}.pdf` : null,
  };
}
