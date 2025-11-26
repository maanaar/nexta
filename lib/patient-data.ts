/* lib/patient-data.ts */
import Odoo from "odoo-xmlrpc";

export type PatientRecord = {
  id: number;
  patientName: string;
  whatsappNum: string;
  modality: string;
  studyDesc: string;
  accessionNum: string;
  patientId: string;
  createdOn: string;
  reportCreationDate: string;
  sentAt: string;
  timer: string;
  state: string;
  pdfUrl: string;
};

export const FALLBACK_PDF_URL =
  "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

export function resolvePdfUrl(patientId: string, override?: string) {
  if (override && override.trim()) return override;

  const template = process.env.PATIENT_PDF_URL;

  if (!template) {
    return `${FALLBACK_PDF_URL}?patient=${encodeURIComponent(patientId)}`;
  }

  if (template.includes("{patientId}")) {
    return template.replace(/{patientId}/g, encodeURIComponent(patientId));
  }

  try {
    const parsed = new URL(template);
    parsed.searchParams.set("patientId", patientId);
    return parsed.toString();
  } catch {
    return `${template}?patientId=${encodeURIComponent(patientId)}`;
  }
}

export const buildPdfUrl = (patientId: string, pdfUrl?: string) =>
  resolvePdfUrl(patientId, pdfUrl);

export const getMockData = (): PatientRecord[] => {
  const now = new Date().toLocaleDateString();
  return [
    {
      id: 1,
      patientName: "John Doe",
      whatsappNum: "+1234567890",
      modality: "CT",
      studyDesc: "Chest CT Scan",
      accessionNum: "ACC001",
      patientId: "PID001",
      createdOn: now,
      reportCreationDate: now,
      sentAt: "N/A",
      timer: "00:00:00",
      state: "InProgress",
      pdfUrl: resolvePdfUrl("1"),
    },
  ];
};

async function fetchExternalPatients(): Promise<PatientRecord[] | null> {
  const externalApi = process.env.PATIENT_API_URL;
  if (!externalApi) return null;

  try {
    const res = await fetch(externalApi);
    if (!res.ok) throw new Error("External patient API failed");

    const data = await res.json();
    const rawPatients = data?.patients || data;

    return rawPatients.map((p: any) => ({
      id: p.id,
      patientName: p.patientName,
      whatsappNum: p.whatsappNum,
      modality: p.modality,
      studyDesc: p.studyDesc,
      accessionNum: p.accessionNum,
      patientId: p.patientId,
      createdOn: p.createdOn,
      reportCreationDate: p.reportCreationDate,
      sentAt: p.sentAt,
      timer: p.timer,
      state: p.state,
      pdfUrl: buildPdfUrl(p.patientId, p.pdfUrl),
    }));
  } catch {
    return null;
  }
}

export async function getAllPatients(): Promise<PatientRecord[]> {
  const external = await fetchExternalPatients();
  return external ?? getMockData();
}
