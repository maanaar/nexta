"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PatientRecord } from "@/lib/patient-data";
import type { SyncStatus } from "@/lib/etiam-sync";
import { dateRange, type DateFilter } from "@/lib/date-filter";

/**
 * Calls `onChange` whenever the server pushes "changed" (ETIAM, HL7, PDFs or
 * another user changed something), and after a reconnect in case one was
 * missed. No polling: one open Server-Sent Events connection.
 */
function useLiveChanges(onChange: () => void) {
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    const events = new EventSource("/api/admin/events");
    let connectedOnce = false;
    events.onopen = () => {
      if (connectedOnce) latest.current();
      connectedOnce = true;
    };
    events.addEventListener("changed", () => latest.current());
    return () => events.close();
  }, []);
}

/** Jobs in the given date range; the server does the filtering. */
export function usePatients(dateFilter: DateFilter) {
  const [data, setData] = useState<PatientRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { from, to } = dateRange(dateFilter);
  // Ignore answers to requests that a newer filter has already replaced
  const requestId = useRef(0);

  const load = useCallback(
    async (silent: boolean) => {
      const id = ++requestId.current;
      try {
        if (!silent) setIsLoading(true);
        const params = new URLSearchParams();
        if (!silent) params.set("sync", "");
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const response = await fetch(`/api/admin/patients?${params}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Failed to fetch data");
        if (id !== requestId.current) return;
        setData(result.data || []);
        setTotal(result.total ?? result.data?.length ?? 0);
        setSync(result.sync || null);
        setError(null);
      } catch (err: any) {
        if (id !== requestId.current) return;
        console.error("Error fetching patient data:", err);
        setError(err.message || "Failed to load patient data");
      } finally {
        if (!silent && id === requestId.current) setIsLoading(false);
      }
    },
    [from, to]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useLiveChanges(() => load(true));

  const refresh = useCallback(() => load(false), [load]);

  /** Swap in one updated record (e.g. from a PATCH response) without refetching. */
  const replaceRecord = useCallback((record: PatientRecord) => {
    setData((prev) => prev.map((p) => (p.id === record.id ? record : p)));
  }, []);

  return { data, total, sync, isLoading, error, refresh, replaceRecord };
}

/** One patient, kept live. */
export function usePatient(id: string) {
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/patients/${id}`, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) throw new Error(result.error || "Failed to load patient");
      setPatient(result.data);
      setNotFound(false);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching patient:", err);
      setError(err.message || "Could not load patient details.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveChanges(load);

  return { patient, setPatient, isLoading, notFound, error };
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
