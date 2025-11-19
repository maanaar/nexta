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
    const patients = await new Promise((resolve, reject) => {
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
    });

    // Transform data to match expected format
    const stages = {
      InProgress: [],
      sent: [],
      failed: [],
      Missing: [],
      no_number: [],
      no_whatsapp: [],
    };

    (patients as any[]).forEach((patient) => {
      const transformedPatient = {
        id: patient.id.toString(),
        name: patient.name || 'Unknown',
        nid: patient.nid || '',
        accession: patient.accession || '',
        study: patient.study || '',
      };

      // Map Odoo stage to organizer stage
      // Adjust these mappings based on your Odoo field values
      let stage = 'Missing';
      
      if (patient.whatsapp_status === 'sent') stage = 'sent';
      else if (patient.whatsapp_status === 'failed') stage = 'failed';
      else if (patient.stage === 'in_progress') stage = 'InProgress';
      else if (!patient.nid) stage = 'no_number';
      else if (!patient.whatsapp_status) stage = 'no_whatsapp';

      if (stages[stage]) {
        stages[stage].push(transformedPatient);
      }
    });

    return NextResponse.json(stages);
  } catch (error) {
    console.error('Odoo API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Odoo', details: error.message },
      { status: 500 }
    );
  }
}