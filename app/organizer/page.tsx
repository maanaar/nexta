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
        const res = await fetch('/api/admin/patients');
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

  const orderedStates = [
    ...statesOrder.filter((state) => grouped[state] && grouped[state].length > 0),
    ...Object.keys(grouped).filter(
      (state) => !statesOrder.includes(state) && grouped[state].length > 0
    ),
  ];

  return (
    <div className="w-full flex flex-col gap-6 mt-10">
      {/* Panel Title */}
      <h2 className="text-5xl w-[25%] text-center font-bold  text-white px-6">Organizer Panel</h2>

      {/* Gray Background Container */}
      <div className="w-full rounded-t-xl bg-[#D9D9D9]/95 min-h-screen py-8 flex flex-col items-center">
        <div className="h-8" />
        <div className="w-[95%] px-4 sm:px-6 lg:px-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-16 mt-4 items-start justify-between">
          {orderedStates.map((state) => (
            <div key={state} className="bg-gray-100 rounded-xl p-4 shadow-lg flex flex-col gap-3">
              <h2 className="font-semibold mb-4 text-center text-gray-800">{state}</h2>
              <div className="flex flex-col gap-3 pb-2">
                {(grouped[state] || []).map((p) => (
                  <div
                    key={p.id}
                    className="bg-white rounded-lg px-3 py-2 shadow-sm hover:shadow-md transition-shadow text-sm text-gray-800"
                  >
                    <div className="font-semibold mb-1">{p.patientName}</div>
                    <div className="flex flex-col gap-1 text-xs text-gray-500">
                      <span>Study: {p.studyDesc}</span>
                      <span>Patient ID: {p.patientId}</span>
                      <span>Accession: {p.accessionNum}</span>
                    </div>
                  </div>
                ))}
                {(grouped[state] || []).length === 0 && (
                  <div className="bg-white/70 rounded-lg px-3 py-2 text-center text-sm text-gray-500">
                    No patients in this state
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
