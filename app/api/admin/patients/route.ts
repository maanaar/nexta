import { NextResponse } from 'next/server';
import Odoo from 'odoo-xmlrpc';

// Mock data function
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

export async function GET() {
  // Check if Odoo is properly configured
  const odooUrl = process.env.ODOO_URL;
  const odooDb = process.env.ODOO_DB;
  const useOdoo = odooUrl && odooDb && odooDb !== 'your_database';

  // If Odoo is not configured, return mock data immediately
  if (!useOdoo) {
    console.log('Odoo not configured, returning mock data');
    return NextResponse.json({ 
      data: getMockData(),
      message: 'Using mock data - Odoo connection not configured'
    });
  }

  try {
    const odoo = new Odoo({
      url: odooUrl || 'http://localhost:8069',
      db: odooDb || 'your_database',
      username: process.env.ODOO_USERNAME || 'admin',
      password: process.env.ODOO_PASSWORD || 'admin',
    });

    // Connect to Odoo with timeout
    await Promise.race([
      new Promise((resolve, reject) => {
        odoo.connect((err: any) => {
          if (err) reject(err);
          else resolve(true);
        });
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      )
    ]);

    // Search and read patient records for admin table
    const patients = await new Promise((resolve, reject) => {
      odoo.execute_kw(
        'patient.record', // Your model name - adjust this!
        'search_read',
        [
          [], // Domain (empty = all records)
          [
            'name',           // Patient name
            'whatsapp_num',   // WhatsApp number
            'modality',       // Modality
            'study',          // Study Desc
            'accession',      // Accession Num
            'nid',            // Patient Id
            'create_date',    // Created On
            'report_date',    // Report Creation Date
            'sent_at',        // Sent At
            'timer',          // Timer
            'stage',          // State
            'whatsapp_status' // For state mapping
          ]
        ],
        (err: any, records: any[]) => {
          if (err) reject(err);
          else resolve(records);
        }
      );
    });

    // Transform data to match table columns
    const tableData = (patients as any[]).map((patient) => ({
      id: patient.id,
      patientName: patient.name || 'Unknown',
      whatsappNum: patient.whatsapp_num || 'N/A',
      modality: patient.modality || 'N/A',
      studyDesc: patient.study || 'N/A',
      accessionNum: patient.accession || 'N/A',
      patientId: patient.nid || 'N/A',
      createdOn: patient.create_date ? new Date(patient.create_date).toLocaleDateString() : 'N/A',
      reportCreationDate: patient.report_date ? new Date(patient.report_date).toLocaleDateString() : 'N/A',
      sentAt: patient.sent_at ? new Date(patient.sent_at).toLocaleDateString() : 'N/A',
      timer: patient.timer || 'N/A',
      state: patient.stage || patient.whatsapp_status || 'N/A',
    }));

    return NextResponse.json({ data: tableData });
  } catch (error: unknown) {
    console.error('Admin Patients API Error:', error);
    
    // Always return mock data on any error
    return NextResponse.json({ 
      data: getMockData(),
      message: 'Using mock data - Odoo connection failed'
    });
  }
}

