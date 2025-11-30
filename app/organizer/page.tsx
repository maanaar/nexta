'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();

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
      <h2 className="text-5xl w-[25%] text-center font-bold text-white px-6 drop-shadow-lg">
        Organizer Panel
      </h2>

      {/* Gray Background */}
      <div className="w-full rounded-t-xl bg-[#D9D9D9]/95 min-h-screen py-10 flex flex-col items-center">
        {/* Spacer */}
        <div className="h-16"></div>

        {/* Kanban Container */}
        <div className="w-[95%] px-4 sm:px-6 lg:px-12 flex flex-row gap-x-8 mt-6 items-start justify-start overflow-x-auto h-[90vh]">
          {orderedStates.map((state) => {
            const count = grouped[state]?.length || 0;

            return (
              <div
                key={state}
                className="bg-gray-100 min-w-[300px] max-w-[350px] rounded-xl p-4 shadow-lg flex flex-col border border-gray-300/40"
              >
                {/* Column Header */}
                <h2 className="font-semibold text-center mb-4 rounded-t-xl py-2 shadow bg-linear-to-r from-[#3485A1]/10 via-[#43739c]/25 to-[#3371A9]/10 text-gray-800 flex flex-row items-center justify-center gap-2">
                  <span>{state}</span>
                  <span className="bg-[#3371A9]/30 text-[#1e3a5f] text-xs font-bold px-2 py-1 rounded-md shadow-sm">
                    {count}
                  </span>
                </h2>

                {/* Cards */}
                <div className="flex flex-col rounded-2xl shadow-inner gap-3 py-2 pr-2 overflow-y-auto max-h-[82vh]">
                  {count > 0 ? (
                    grouped[state].map((p) => (
                      <div
                        key={p.id}
                        className="bg-white rounded-lg px-4 py-3 shadow hover:shadow-md transition-all text-sm border border-gray-200 cursor-pointer"
                        onClick={() => router.push(`/patient/${p.id}`)}
                      >
                        <div className="font-semibold text-gray-800">{p.patientName}</div>
                        <div className="flex flex-col text-xs justify-items-end items-start text-gray-600 mt-1">
                          <span>Study: {p.studyDesc}</span>
                          <span>Patient ID: {p.patientId}</span>
                          <span>Accession: {p.accessionNum}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-white/70 rounded-lg px-3 py-2 text-center text-sm text-gray-500 border border-gray-200">
                      No patients in this state
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
