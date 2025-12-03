/* lib/patient-data.ts */
import Database from "better-sqlite3";

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

// SQLite Configuration (from your Python code)
const SQLITE_DB_PATH =
  process.env.SQLITE_DB_PATH ||
  "C:\\ProgramData\\Etiam\\DcmPRI\\StorePrint\\sqlite.db";

// State mapping
const stateMapping: Record<string, string> = {
  send: "Waiting to Send",
  done: "Sent",
  failed: "Failed",
  no_number: "No Number",
  no_whatsapp: "No WhatsApp",
  signed_out: "WhatsApp Signed Out",
};

function formatState(state: string): string {
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

// Fetch directly from SQLite DICOM database (ETIAM)
async function fetchFromDicomDB(): Promise<PatientRecord[] | null> {
  try {
    console.log("Connecting to SQLite database:", SQLITE_DB_PATH);
    
    // Open SQLite database
    const db = new Database(SQLITE_DB_PATH, { readonly: true, fileMustExist: true });
    
    console.log("Connected to SQLite database successfully");

    // Query based on your Python code structure for ETIAM
    const query = `
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
      LIMIT 1000
    `;

    const rows = db.prepare(query).all();
    console.log(`Fetched ${rows.length} records from SQLite DICOM DB`);

    // Map SQLite results to PatientRecord format
    const records: PatientRecord[] = rows.map((row: any, index) => {
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

    db.close();
    return records;
  } catch (error) {
    console.error("Error fetching from SQLite DICOM DB:", error);
    return null;
  }
}

// Alternative: Fetch from Odoo's PostgreSQL database directly
async function fetchFromOdooPostgres(): Promise<PatientRecord[] | null> {
  // If you want to connect to Odoo's PostgreSQL database instead
  // Install: npm install pg
  // import { Pool } from 'pg';
  
  try {
    const { Pool } = require("pg");
    
    const pool = new Pool({
      host: process.env.ODOO_DB_HOST || "localhost",
      port: parseInt(process.env.ODOO_DB_PORT || "5432"),
      database: process.env.ODOO_DB_NAME || "odoo",
      user: process.env.ODOO_DB_USER || "odoo",
      password: process.env.ODOO_DB_PASSWORD || "odoo",
    });

    const query = `
      SELECT 
        w.id,
        w.accession,
        w.phone_one,
        w.study_desc,
        w.date_time,
        w.create_date,
        w.date_sent,
        w.state,
        w.sec_id,
        p.name as patient_name,
        p.patient_id,
        p.phone as patient_phone,
        m.name as modality_name
      FROM onthefly_model w
      LEFT JOIN patient_model p ON w.patient = p.id
      LEFT JOIN modality_model m ON w.modalityy = m.id
      ORDER BY w.create_date DESC
      LIMIT 1000
    `;

    const result = await pool.query(query);
    console.log(`Fetched ${result.rows.length} records from Odoo PostgreSQL`);

    const records: PatientRecord[] = result.rows.map((row) => {
      const createdOn = formatDate(row.create_date || row.date_time);
      const sentAt = formatDate(row.date_sent);

      return {
        id: row.id,
        patientName: row.patient_name || "Unknown Patient",
        whatsappNum: row.phone_one || row.patient_phone || "N/A",
        modality: row.modality_name || "N/A",
        studyDesc: row.study_desc || "N/A",
        accessionNum: row.accession || "N/A",
        patientId: row.patient_id || "N/A",
        createdOn,
        reportCreationDate: formatDate(row.date_time),
        sentAt,
        timer: calculateTimer(row.create_date || row.date_time, row.date_sent),
        state: formatState(row.state || "unknown"),
        pdfUrl: row.sec_id
          ? `/api/pdf/${row.sec_id}`
          : FALLBACK_PDF_URL,
      };
    });

    await pool.end();
    return records;
  } catch (error) {
    console.error("Error fetching from Odoo PostgreSQL:", error);
    return null;
  }
}

// Legacy functions
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

// Main function - choose your data source
export async function getAllPatients(): Promise<PatientRecord[]> {
  const dataSource = process.env.DATA_SOURCE || "dicom"; // 'dicom' or 'odoo_postgres'

  console.log(`Fetching patients from ${dataSource}...`);

  let patients: PatientRecord[] | null = null;

  if (dataSource === "dicom") {
    patients = await fetchFromDicomDB();
  } else if (dataSource === "odoo_postgres") {
    patients = await fetchFromOdooPostgres();
  }

  if (patients && patients.length > 0) {
    console.log(`Successfully fetched ${patients.length} patients`);
    return patients;
  }

  console.log("Falling back to mock data");
  return getMockData();
}