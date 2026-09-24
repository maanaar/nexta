/* lib/patient-data.ts */
import type { JobRow } from "@/lib/nexta-db";

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

export function toPatientRecord(job: JobRow): PatientRecord {
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
  };
}
