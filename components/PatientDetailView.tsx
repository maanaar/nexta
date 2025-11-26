"use client";

import { useEffect, useMemo, useState } from "react";
import PatientPdfViewer from "./PatientPdfViewer";

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
  pdfUrl: string; // IMPORTANT after PDF refactor
};

const timelineStates = ["Missing", "InProgress", "sent"];

export default function PatientDetailView({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;

    setIsLoading(true);
    fetch("/api/admin/patients")
      .then((res) => res.json())
      .then((payload) => {
        if (canceled) return;

        const found = (payload?.data || []).find(
          (item: PatientRecord) => item.id.toString() === patientId
        );

        setPatient(found || null);
      })
      .catch((err) => {
        if (canceled) return;
        console.error("Unable to load patient", err);
        setError("Could not load patient details.");
      })
      .finally(() => {
        if (!canceled) {
          setIsLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [patientId]);

  const timeline = useMemo(() => {
    if (!patient) return timelineStates;
    return timelineStates.map((state) => ({
      label: state,
      active: state === patient.state,
    }));
  }, [patient]);

  if (isLoading) {
    return <div className="py-8 text-center text-white">Loading patient...</div>;
  }

  if (error) {
    return <div className="p-4 bg-rose-500/30 text-rose-50">{error}</div>;
  }

  if (!patient) {
    return (
      <div className="p-6 bg-white/60 rounded shadow text-gray-800">
        Patient not found.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-y-8 w-full h-[40%] justify-center items-center my-6">
      
      {/* TIMELINE */}
      <section className="rounded-xl w-[90%] bg-white/80 p-6 shadow-lg space-y-4">
        <div className="flex flex-wrap gap-4">
          {timeline.map((step) => (
            <div
              key={step.label}
              className={`flex-1 min-w-[120px] rounded-2xl border px-4 py-2 text-center text-xs font-semibold ${
                step.active
                  ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                  : "border-gray-300 bg-gray-100 text-gray-500"
              }`}
            >
              {step.label}
            </div>
          ))}
        </div>
      </section>

      {/* PATIENT DETAILS */}
      <section className="w-[90%] grid gap-6 rounded-xl bg-white/80 shadow-lg text-sm text-gray-800 md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs uppercase text-gray-500">Patient name</p>
          <p className="text-xl font-semibold text-gray-900">{patient.patientName}</p>
          <p className="text-xs font-semibold text-gray-500">Patient ID</p>
          <p className="text-base">{patient.patientId}</p>
          <p className="text-xs font-semibold text-gray-500">WhatsApp</p>
          <p>{patient.whatsappNum}</p>
        </div>

        <div className="space-y-3">
          <p className="text-xs uppercase text-gray-500">Study</p>
          <p className="text-base">{patient.studyDesc}</p>
          <p className="text-xs font-semibold text-gray-500">Accession</p>
          <p>{patient.accessionNum}</p>
          <p className="text-xs font-semibold text-gray-500">Modality</p>
          <p>{patient.modality}</p>
        </div>
      </section>

      {/* PDF VIEWER */}
      <section className="w-[90%] rounded-xl bg-white/90 p-6 shadow-lg">
        <p className="w-full text-xs uppercase text-gray-500 mb-2">Patient PDF</p>

        {patient.pdfUrl ? (
          <PatientPdfViewer pdfUrl={patient.pdfUrl} />
        ) : (
          <div className="text-gray-500 text-sm">No PDF available.</div>
        )}
      </section>
    </div>
  );
}
