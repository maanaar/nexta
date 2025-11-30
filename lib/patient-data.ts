/* lib/patient-data.ts */
import sql from "mssql"

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

const sqlConfig: sql.config ={
  server: process.env.SQL_SERVER || "NEXTA",
  database: process.env.SQL_DATABASE || "dicom",
  user: process.env.SQL_USER || "sa",
  password: process.env.SQL_PASSWORD || "P@ssw0rd",
  options: {
    encrypt: false, // Set to true if using Azure
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },

};

// State mapping
const stateMapping: Record<string, string> = {
  send: "Waiting to Send",
  done: "Sent",
  failed: "Failed",
  no_number: "No Number",
  no_whatsapp: "No WhatsApp",
  signed_out: "WhatsApp Signed Out",
};

function formatState(state: string): string{
    return stateMapping[state] || state;
}

// Calculate timer
function calculateTimer(createdOn: string, sentAt?: string): string {
  try {
    const start = new Date(createdOn);
    const end = sentAt ? new Date(sentAt) : new Date();
    const diff = Math.abs(end.getTime() - start.getTime());

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  } catch {
    return "00:00:00";
  }
}

// Format date
function formatDate(dateStr: any): string {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return String(dateStr);
  }
}

async function fetchFromDicomDB(): Promise<PatientRecord[] | null>{
  try{
    const pool =await sql.connect(sqlConfig);
    console.log("Connected to SQL Server")

    const result = await pool.request().query(`
      SELECT
        pjb_StudyDate,
        pjb_PatientsName,
        pjb_AccessionNumber,
        pjb_PatientID,
        pjb_Modality,
        pjb_StudyDescription,
        pjb_JobUID
      FROM PrintJob
      ORDER BY pjb_StudyDate DESC
      `);
      console.log(`Fetched ${result.recordset.length} recs from DICOm DB`);
      // Map SQL results to PatientRecord format
      const records: PatientRecord[] = result.recordset.map((row, index) => {

        // Format study date from YYYYMMDD to readable format
        let createdOn = "N/A";
        if (row.pjb_StudyDate) {
          const dateStr = String(row.pjb_StudyDate);
          try {
            createdOn = `${dateStr.substring(0, 4)}-${dateStr.substring(
              4,
              6
            )}-${dateStr.substring(6, 8)}`;
          } catch {
            createdOn = dateStr;
          }
        }

        const patientId = row.pjb_PatientID?.trim() || "N/A";
        const accessionNum = row.pjb_AccessionNumber?.trim() || "N/A";

        return {
          id: index + 1,
          patientName: row.pjb_PatientsName?.trim() || "Unknown Patient",
          whatsappNum: "N/A", // Will be populated from HL7 folder
          modality: row.pjb_Modality?.trim() || "N/A",
          studyDesc: row.pjb_StudyDescription?.trim() || "N/A",
          accessionNum,
          patientId,
          createdOn,
          reportCreationDate: createdOn,
          sentAt: "N/A",
          timer: "00:00:00",
          state: "Pending",
          pdfUrl: `${FALLBACK_PDF_URL}?accession=${encodeURIComponent(
            accessionNum
          )}`,
        };
    });

    await pool.close();
    return records;
  } catch (error) {
    console.error("Error fetching from DICOM DB:", error);
    return null;
  }

  
}


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

// async function fetchExternalPatients(): Promise<PatientRecord[] | null> {
  // const externalApi = process.env.PATIENT_API_URL;
  // if (!externalApi) return null;

  // try {
  //   const res = await fetch(externalApi);
  //   if (!res.ok) throw new Error("External patient API failed");

  //   const data = await res.json();
  //   const rawPatients = data?.patients || data;

  //   return rawPatients.map((p: any) => ({
  //     id: p.id,
  //     patientName: p.patientName,
  //     whatsappNum: p.whatsappNum,
  //     modality: p.modality,
  //     studyDesc: p.studyDesc,
  //     accessionNum: p.accessionNum,
  //     patientId: p.patientId,
  //     createdOn: p.createdOn,
  //     reportCreationDate: p.reportCreationDate,
  //     sentAt: p.sentAt,
  //     timer: p.timer,
  //     state: p.state,
  //     pdfUrl: buildPdfUrl(p.patientId, p.pdfUrl),
  //   }));
  // } catch {
  //   return null;
  // }
// }

export async function getAllPatients(): Promise<PatientRecord[]> {
  const dataSource = process.env.DATA_SOURCE || "dicom";
  console.log(`Fetching patients from ${dataSource}`)

  let patients: PatientRecord[] | null=null;

  if (dataSource === "dicom"){
    patients = await fetchFromDicomDB();
  }
  // }else if(dataSource === 'odoo_postgres'){
  //   patients = await fetchFromOdooPostgres();
  // }

  if (patients && patients.length>0){
    console.log(`Successfully fetched ${patients.length} patients`);
    return patients;
  }
  console.log("Falling back to mock data");
  return patients ?? getMockData();
}
