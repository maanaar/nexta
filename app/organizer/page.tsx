'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';

interface Patient {
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
}

const statesOrder = ['sent', 'InProgress', 'No number', 'No whatapp', 'Failed', 'Missing'];

export default function PatientBoard() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res = await fetch('/api/patients'); // your API route
        const data = await res.json();
        setPatients(data.data || []);
      } catch (err) {
        console.error('Failed to fetch patients', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPatients();
  }, []);

  if (loading) return <div className="text-center py-10">Loading...</div>;

  // Group patients by state
  const grouped: Record<string, Patient[]> = {};
  patients.forEach((p) => {
    const state = p.state || 'Missing';
    if (!grouped[state]) grouped[state] = [];
    grouped[state].push(p);
  });

  return (
    <div className="w-full px-4 sm:px-6 lg:px-12 py-6 flex gap-4 overflow-x-auto">
      {statesOrder.map((state) => (
        <div key={state} className="flex-1 min-w-[220px] bg-gray-100 rounded-xl p-4 shadow-lg">
          <h2 className="font-semibold mb-4 text-center text-gray-800">{state}</h2>
          <div className="flex flex-col gap-4">
            {(grouped[state] || []).map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-xl p-3 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              >
                <p className="text-sm font-semibold">{p.patientName}</p>
                <p className="text-xs text-gray-500">
                  ID: {p.patientId} | Accession: {p.accessionNum}
                </p>
                <p className="text-xs text-gray-500">Study: {p.studyDesc}</p>
                <p className="text-xs text-gray-500">WhatsApp: {p.whatsappNum}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
