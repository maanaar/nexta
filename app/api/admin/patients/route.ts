import { NextResponse } from 'next/server';
import Odoo from 'odoo-xmlrpc';

// --- MOCK DATA ---
function getMockData() {
  return [
    {
      id: 1,
      patientName: 'John Doe',
      whatsappNum: '+1234567890',
      modality: 'CT',
      studyDesc: 'Chest CT Scan',
      accessionNum: 'ACC001',
      patientId: 'PID001',
      createdOn: new Date().toLocaleDateString(),
      reportCreationDate: new Date().toLocaleDateString(),
      sentAt: 'N/A',
      timer: '00:00:00',
      state: 'InProgress',
    },
    {
      id: 2,
      patientName: 'Jane Smith',
      whatsappNum: '+0987654321',
      modality: 'MRI',
      studyDesc: 'Brain MRI',
      accessionNum: 'ACC002',
      patientId: 'PID002',
      createdOn: new Date().toLocaleDateString(),
      reportCreationDate: new Date().toLocaleDateString(),
      sentAt: new Date().toLocaleDateString(),
      timer: '01:30:00',
      state: 'sent',
    },
    {
      id: 3,
      patientName: 'Bob Johnson',
      whatsappNum: 'N/A',
      modality: 'X-Ray',
      studyDesc: 'Chest X-Ray',
      accessionNum: 'ACC003',
      patientId: 'PID003',
      createdOn: new Date().toLocaleDateString(),
      reportCreationDate: 'N/A',
      sentAt: 'N/A',
      timer: '00:00:00',
      state: 'Missing',
    },
    {
      id: 4,
      patientName: 'Alice Williams',
      whatsappNum: '+1122334455',
      modality: 'Ultrasound',
      studyDesc: 'Abdominal Ultrasound',
      accessionNum: 'ACC004',
      patientId: 'PID004',
      createdOn: new Date().toLocaleDateString(),
      reportCreationDate: new Date().toLocaleDateString(),
      sentAt: 'N/A',
      timer: '00:45:00',
      state: 'InProgress',
    },
    {
      id: 5,
      patientName: 'Charlie Brown',
      whatsappNum: 'N/A',
      modality: 'CT',
      studyDesc: 'Head CT',
      accessionNum: 'ACC005',
      patientId: 'PID005',
      createdOn: new Date().toLocaleDateString(),
      reportCreationDate: 'N/A',
      sentAt: 'N/A',
      timer: '00:00:00',
      state: 'Missing',
    },
  ];
}

// --- OPTIONAL EXTERNAL PATIENT API ---
async function fetchExternalPatients() {
  const externalApi = process.env.PATIENT_API_URL;

  if (!externalApi) return null;

  try {
    const response = await fetch(externalApi);
    if (!response.ok) throw new Error('External patient API failed');

    const data = await response.json();

    return data?.patients || data;
  } catch (err) {
    console.error("External API error:", err);
    return null;
  }
}

export async function GET() {
  const odooUrl = process.env.ODOO_URL;
  const odooDb = process.env.ODOO_DB;

  const useOdoo = odooUrl && odooDb && odooDb !== 'your_database';

  // --- STEP 1: Try External API First ---
  const externalPatients = await fetchExternalPatients();

  if (externalPatients) {
    console.log("Using data from EXTERNAL PATIENT API");

    const transformed = externalPatients.map((p: any) => ({
      id: p.id,
      patientName: p.patientName || p.name || "Unknown",
      whatsappNum: p.whatsappNum || p.whatsapp || "N/A",
      modality: p.modality || "N/A",
      studyDesc: p.studyDesc || p.study || "N/A",
      accessionNum: p.accessionNum || p.accession || "N/A",
      patientId: p.patientId || p.nid || "N/A",
      createdOn: p.createdOn ? new Date(p.createdOn).toLocaleDateString() : "N/A",
      reportCreationDate: p.reportCreationDate ? new Date(p.reportCreationDate).toLocaleDateString() : "N/A",
      sentAt: p.sentAt ? new Date(p.sentAt).toLocaleDateString() : "N/A",
      timer: p.timer || "N/A",
      state: p.state || "N/A",
    }));

    return NextResponse.json({
      data: transformed,
      message: "Data loaded from external patient API",
    });
  }

  // --- STEP 2: If no external API, try Odoo ---
  if (!useOdoo) {
    console.log('Odoo not configured — returning MOCK DATA');
    return NextResponse.json({
      data: getMockData(),
      message: 'Using mock data — neither Odoo nor external API is available'
    });
  }

  try {
    const odoo = new Odoo({
      url: odooUrl!,
      db: odooDb!,
      username: process.env.ODOO_USERNAME || 'admin',
      password: process.env.ODOO_PASSWORD || 'admin',
    });

    await new Promise((resolve, reject) => {
      odoo.connect((err: any) => {
        if (err) reject(err);
        else resolve(true);
      });
    });

    const patients = await new Promise((resolve, reject) => {
      odoo.execute_kw(
        'patient.record',
        'search_read',
        [
          [],
          [
            'name',
            'whatsapp_num',
            'modality',
            'study',
            'accession',
            'nid',
            'create_date',
            'report_date',
            'sent_at',
            'timer',
            'stage',
            'whatsapp_status'
          ]
        ],
        (err: any, recs: any[]) => {
          if (err) reject(err);
          else resolve(recs);
        }
      );
    });

    const tableData = (patients as any[]).map((p) => ({
      id: p.id,
      patientName: p.name || 'Unknown',
      whatsappNum: p.whatsapp_num || 'N/A',
      modality: p.modality || 'N/A',
      studyDesc: p.study || 'N/A',
      accessionNum: p.accession || 'N/A',
      patientId: p.nid || 'N/A',
      createdOn: p.create_date ? new Date(p.create_date).toLocaleDateString() : 'N/A',
      reportCreationDate: p.report_date ? new Date(p.report_date).toLocaleDateString() : 'N/A',
      sentAt: p.sent_at ? new Date(p.sent_at).toLocaleDateString() : 'N/A',
      timer: p.timer || 'N/A',
      state: p.stage || p.whatsapp_status || 'N/A',
    }));

    return NextResponse.json({ data: tableData });

  } catch (error) {
    console.error("Odoo API error:", error);

    return NextResponse.json({
      data: getMockData(),
      message: "Using mock data — Odoo connection failed"
    });
  }
}
