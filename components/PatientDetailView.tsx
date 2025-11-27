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

const timelineStates = ["Waiting for Report","Inprogress","Sent","Failed", "Missing", "No Number","No WhatsAPP"];
type timelineStates = {
  label: string;
  active: boolean;
};

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm text-gray-600 font-medium">{label}:</span>
      <div className="mt-1 h-7 bg-[#E8F2F7] border border-[#9CC5DB] rounded-md px-3 flex items-center text-gray-800 text-sm">
        {value || "—"}
      </div>
    </div>
  );
}

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
    <div className="w-full flex flex-col items-center">
  
      {/* --- PAGE CONTAINER (GREY AREA LIKE FIGMA) --- */}
      <div className="w-full bg-[#EFEFEF] min-h-screen py-10 flex flex-col gap-10 items-center">
  
        {/* -------- TIMELINE (Matches Figma) -------- */}
        <div className="h-4"></div>
        <div className="w-[90%] bg-white rounded-xl px-6 py-4 shadow">
          <div className="flex w-full justify-between">
            {timeline.map((step) => (
              <div
                key={step.label}
                className={`
                  flex-1 h-6 mx-1 rounded-md border
                  text-[10px] flex items-center justify-center font-medium
                  ${
                    step.active
                      ? "bg-[#BFD7EA] text-[#1c3d5a] border-[#1c3d5a]"
                      : "bg-[#E8E8E8] text-gray-500 border-gray-300"
                  }
                `}
              >
                {step.label}
              </div>
            ))}
          </div>
        </div>
  
        {/* -------- PATIENT DETAILS CARD -------- */}
        <div className="w-[90%] bg-white rounded-xl mt-6 shadow px-10 py-8">
          {/* <h2 className="text-xl font-semibold text-gray-700 mb-6">
            Patient
          </h2> */}
  
          <div className="grid grid-cols-2 gap-y-6 gap-x-20">
            {/* LEFT COLUMN */}
            <div className="space-y-4">
              <DetailField label="Patient name" value={patient.patientName} />
              <DetailField label="Patient ID" value={patient.patientId} />
              <DetailField label="WhatsApp number" value={patient.whatsappNum} />
              <DetailField label="Modality" value={patient.modality} />
              <DetailField label="Study Desc" value={patient.studyDesc} />
            </div>
  
            {/* RIGHT COLUMN */}
            <div className="space-y-4">
              <DetailField label="Created On" value={patient.createdOn} />
              <DetailField label="Sent At" value={patient.sentAt} />
              <DetailField
                label="Report creation date"
                value={patient.reportCreationDate}
              />
              <DetailField label="Timer" value={patient.timer} />
              <DetailField label="Accession number" value={patient.accessionNum} />
            </div>
          </div>
        </div>
  
        {/* -------- PDF VIEW SECTION -------- */}
        <div className="w-[90%] bg-white rounded-xl shadow px-8 py-6 mt-8">
          <p className="text-xs font-semibold text-gray-600 mb-3">Patient PDF:</p>
  
          {patient.pdfUrl ? (
            <PatientPdfViewer pdfUrl={patient.pdfUrl} />
          ) : (
            <div className="text-gray-500 text-sm">No PDF available.</div>
          )}
        </div>
      </div>
    </div>
  );
  
}
