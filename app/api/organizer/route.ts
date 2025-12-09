// app/api/organizer/route.ts
import { NextResponse } from 'next/server';
import Odoo from 'odoo-xmlrpc';

export async function GET() {
  try {
    const odoo = new Odoo({
      url: process.env.ODOO_URL || 'http://localhost:8069',
      db: process.env.ODOO_DB || 'your_database',
      username: process.env.ODOO_USERNAME || 'admin',
      password: process.env.ODOO_PASSWORD || 'admin',
    });

    // Connect to Odoo
    await new Promise((resolve, reject) => {
      odoo.connect((err: any) => {
        if (err) reject(err);
        else resolve(true);
      });
    });

    // Search and read patient records
    const patients = (await new Promise((resolve, reject) => {
      odoo.execute_kw(
        'patient.record', // Your model name - adjust this!
        'search_read',
        [
          [], // Domain (empty = all records)
          ['name', 'nid', 'accession', 'study', 'stage', 'whatsapp_status'] // Fields to read
        ],
        (err: any, records: any[]) => {
          if (err) reject(err);
          else resolve(records);
        }
      );
    })) as any[];

    type Stage = "InProgress" | "sent" | "failed" | "Missing" | "no_number" | "no_whatsapp";

    const stages: Record<Stage, any[]> = {
      InProgress: [],
      sent: [],
      failed: [],
      Missing: [],
      no_number: [],
      no_whatsapp: [],
    };

    // Process patients
    patients.forEach((patient) => {
      const transformedPatient = {
        id: patient.id.toString(),
        name: patient.name || 'Unknown',
        nid: patient.nid || '',
        accession: patient.accession || '',
        study: patient.study || '',
      };

      // Default stage
      let stage: Stage = 'Missing';

      // Map Odoo stage to organizer stage
      if (patient.whatsapp_status === 'sent') stage = 'sent';
      else if (patient.whatsapp_status === 'failed') stage = 'failed';
      else if (patient.stage === 'in_progress') stage = 'InProgress';
      else if (!patient.nid) stage = 'no_number';
      else if (!patient.whatsapp_status) stage = 'no_whatsapp';

      // Push to the appropriate stage
      stages[stage].push(transformedPatient);
    });

    return NextResponse.json(stages);
  } catch (error: any) {
    console.error('Odoo API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Odoo', details: error.message },
      { status: 500 }
    );
  }
}
