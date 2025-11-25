'use client';

import React, { useEffect, useState } from 'react';

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
        <div className="w-full max-w-6xl px-4 sm:px-6 lg:px-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-16 mt-4 items-start justify-center">
          {orderedStates.map((state) => (
            <div key={state} className="bg-gray-100 rounded-xl p-4 shadow-lg flex flex-col">
              <h2 className="font-semibold h-[10%] mb-4 text-center rounded-2xl shadow-3xl bg-linear-to-r from-[#3485A1]/0 via-[#43739c]/25 to-[#3371A9]/10 text-gray-800">{state}</h2>
              <div className="flex flex-col rounded-2xl shadow-2xl gap-1 pl-16">
                {(grouped[state] || []).map((p) => (
                  <div
                    key={p.id}
                    className="bg-gray-300/20 rounded-lg px-8 py-2 shadow-sm hover:shadow-md transition-shadow text-sm align-text-left text-gray-800"
                  >
                    <div className="font-semibold">{p.patientName}</div>
                    <div className="flex flex-col gap-x-1 text-xs rounded-2xl shadow-md text-gray-500">
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
