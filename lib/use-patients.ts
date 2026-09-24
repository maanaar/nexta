"use client";

import { useCallback, useEffect, useState } from "react";
import type { PatientRecord } from "@/lib/patient-data";

export function usePatients() {
  const [data, setData] = useState<PatientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/admin/patients", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to fetch data");
      setData(result.data || []);
    } catch (err: any) {
      console.error("Error fetching patient data:", err);
      setError(err.message || "Failed to load patient data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, isLoading, error, refresh };
}

export function matchesSearch(patient: PatientRecord, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [patient.patientId, patient.patientName, patient.accessionNum, patient.studyDesc]
    .some((value) => value?.toLowerCase().includes(q));
}

export function initials(name: string) {
  const parts = name.replace(/[\^,]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
