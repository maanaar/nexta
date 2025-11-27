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
    {
      id: 2,
      patientName: "p2",
      whatsappNum: "+1239567890",
      modality: "Xray",
      studyDesc: "Chest CT Scan",
      accessionNum: "ACC001",
      patientId: "PID001",
      createdOn: now,
      reportCreationDate: now,
      sentAt: "N/A",
      timer: "00:00:00",
      state: "Sent",
      pdfUrl: resolvePdfUrl("2"),
    },
    {
      id: 3,
      patientName: "Sarah Ahmed",
      whatsappNum: "+201234000111",
      modality: "MRI",
      studyDesc: "Brain MRI Screening",
      accessionNum: "ACC003",
      patientId: "PID003",
      createdOn: now,
      reportCreationDate: now,
      sentAt: "N/A",
      timer: "01:12:32",
      state: "Waiting for Report",
      pdfUrl: resolvePdfUrl("3"),
    },
    {
      id: 4,
      patientName: "Mohamed Ali",
      whatsappNum: "N/A",
      modality: "Ultrasound",
      studyDesc: "Pelvic Ultrasound",
      accessionNum: "ACC004",
      patientId: "PID004",
      createdOn: now,
      reportCreationDate: now,
      sentAt: "N/A",
      timer: "00:34:19",
      state: "No Number",
      pdfUrl: resolvePdfUrl("4"),
    },
    {
      id: 5,
      patientName: "Emily Stone",
      whatsappNum: "+14444556677",
      modality: "CT",
      studyDesc: "Neck CT",
      accessionNum: "ACC005",
      patientId: "PID005",
      createdOn: now,
      reportCreationDate: now,
      sentAt: "N/A",
      timer: "02:10:20",
      state: "Failed",
      pdfUrl: resolvePdfUrl("5"),
    },
    {
      id: 6,
      patientName: "Hassan Youssef",
      whatsappNum: "+201008889999",
      modality: "Xray",
      studyDesc: "Chest Xray",
      accessionNum: "ACC006",
      patientId: "PID006",
      createdOn: now,
      reportCreationDate: now,
      sentAt: now,
      timer: "00:10:00",
      state: "Sent",
      pdfUrl: resolvePdfUrl("6"),
    },
    {
      id: 7,
      patientName: "Olivia Brown",
      whatsappNum: "+112200334455",
      modality: "MRI",
      studyDesc: "Spine MRI",
      accessionNum: "ACC007",
      patientId: "PID007",
      createdOn: now,
      reportCreationDate: now,
      sentAt: "N/A",
      timer: "00:42:55",
      state: "Missing",
      pdfUrl: resolvePdfUrl("7"),
    },
    {
      id: 8,
      patientName: "Ahmed Samir",
      whatsappNum: "N/A",
      modality: "Ultrasound",
      studyDesc: "Abdominal Ultrasound",
      accessionNum: "ACC008",
      patientId: "PID008",
      createdOn: now,
      reportCreationDate: now,
      sentAt: "N/A",
      timer: "00:05:19",
      state: "No WhatsAPP",
      pdfUrl: resolvePdfUrl("8"),
    },
    {
      id: 9,
      patientName: "James Wilson",
      whatsappNum: "+13332221100",
      modality: "CT",
      studyDesc: "Full Body CT",
      accessionNum: "ACC009",
      patientId: "PID009",
      createdOn: now,
      reportCreationDate: now,
      sentAt: "N/A",
      timer: "01:20:17",
      state: "Inprogress",
      pdfUrl: resolvePdfUrl("9"),
    },
    {
      id: 10,
      patientName: "Lara Nabil",
      whatsappNum: "+201222554433",
      modality: "Xray",
      studyDesc: "Foot Xray",
      accessionNum: "ACC010",
      patientId: "PID010",
      createdOn: now,
      reportCreationDate: now,
      sentAt: "N/A",
      timer: "00:18:48",
      state: "Waiting for Report",
      pdfUrl: resolvePdfUrl("10"),
    },
    {
      id: 11,
      patientName: "Karim Salim",
      whatsappNum: "+201005557770",
      modality: "MRI",
      studyDesc: "Knee MRI",
      accessionNum: "ACC011",
      patientId: "PID011",
      createdOn: now,
      reportCreationDate: now,
      sentAt: now,
      timer: "00:02:09",
      state: "Sent",
      pdfUrl: resolvePdfUrl("11"),
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
