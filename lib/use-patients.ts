"use client";

import { useCallback, useEffect, useState } from "react";
import type { PatientRecord } from "@/lib/patient-data";
import type { SyncStatus } from "@/lib/etiam-sync";

export function usePatients() {
  const [data, setData] = useState<PatientRecord[]>([]);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent: boolean) => {
    try {
      if (!silent) setIsLoading(true);
      const response = await fetch(`/api/admin/patients${silent ? "" : "?sync"}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to fetch data");
      setData(result.data || []);
      setSync(result.sync || null);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching patient data:", err);
      setError(err.message || "Failed to load patient data");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(false), [load]);

  useEffect(() => {
    load(false);
    // The server pushes "changed" when ETIAM data updates, so there's no polling.
    // EventSource reconnects on its own; reload on reconnect in case we missed one.
    const events = new EventSource("/api/admin/events");
    let connectedOnce = false;
    events.onopen = () => {
      if (connectedOnce) load(true);
      connectedOnce = true;
    };
    events.addEventListener("changed", () => load(true));
    return () => events.close();
  }, [load]);

  return { data, sync, isLoading, error, refresh };
}

export function matchesSearch(patient: PatientRecord, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [patient.patientId, patient.patientName, patient.accessionNum, patient.studyDesc, patient.whatsappNum]
    .some((value) => value?.toLowerCase().includes(q));
}

export function initials(name: string) {
  const parts = name.replace(/[\^,]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
