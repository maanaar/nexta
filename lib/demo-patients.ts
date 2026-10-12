import type { PatientRecord } from "@/lib/patient-data";
import { toDateKey } from "@/lib/date-filter";

/** Dummy cards for previewing the Delivery board (open /organizer?demo). Ids are negative so they never clash with real jobs. */
const ROWS: [string, string, string, string, string, string, boolean][] = [
  // name, study, modality, state, patientId, phone, hasPdf
  ["Ahmed Hassan", "CT Chest with contrast", "CT", "waiting", "P-10021", "N/A", false],
  ["Layla Mansour", "MRI Brain", "MR", "waiting", "P-10022", "N/A", false],
  ["Omar Khalil", "X-Ray Chest PA", "CR", "waiting", "P-10023", "N/A", false],
  ["Sara Nasser", "Ultrasound Abdomen", "US", "no_number", "P-10031", "N/A", true],
  ["Youssef Ibrahim", "MRI Lumbar Spine", "MR", "no_number", "P-10032", "N/A", true],
  ["Mariam Saleh", "CT Abdomen & Pelvis", "CT", "send", "P-10041", "+201001234567", true],
  ["Khaled Farouk", "Mammography Bilateral", "MG", "send", "P-10042", "+201112223344", true],
  ["Nour Adel", "X-Ray Knee", "CR", "send", "P-10043", "+201223334455", true],
  ["Hana Mostafa", "Ultrasound Pelvis", "US", "done", "P-10051", "+201005556677", true],
  ["Tarek Zaki", "CT Brain", "CT", "done", "P-10052", "+201118889900", true],
  ["Dina Samir", "MRI Knee", "MR", "done", "P-10053", "+201227778899", true],
  ["Karim Fouad", "X-Ray Spine", "CR", "failed", "P-10061", "+201009998877", true],
  ["Rania Gamal", "CT Sinuses", "CT", "no_whatsapp", "P-10071", "+201114445566", true],
  ["Mostafa Reda", "MRI Shoulder", "MR", "signed_out", "P-10081", "+201226667788", true],
];

export function makeDemoPatients(): PatientRecord[] {
  const today = toDateKey(new Date());
  return ROWS.map(([patientName, studyDesc, modality, state, patientId, whatsappNum, hasPdf], i) => ({
    id: -(i + 1),
    patientName,
    whatsappNum,
    phoneSource: whatsappNum === "N/A" ? null : "hl7",
    modality,
    studyDesc,
    accessionNum: `ACC${String(330900 + i * 7)}`,
    patientId,
    createdOn: today,
    reportCreationDate: `${today} 09:${String(10 + i).padStart(2, "0")}`,
    sentAt: state === "done" ? `${today} 10:${String(10 + i).padStart(2, "0")}` : "N/A",
    timer: "N/A",
    state,
    pdfs: hasPdf ? [{ label: `ACC${330900 + i * 7}.pdf`, url: "" }] : [],
    pdfBlockedReason: null,
  }));
}
