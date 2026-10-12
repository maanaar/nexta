"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PatientRecord } from "@/lib/patient-data";
import type { SyncStatus } from "@/lib/etiam-sync";
import { dateRange, type DateFilter } from "@/lib/date-filter";

/** Parses a JSON response, or explains what went wrong when the body isn't JSON (e.g. an empty 500). */
async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: `Server error ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}` };
  }
}

/**
 * Calls `onChange(ids)` whenever the server pushes "changed" (ETIAM, HL7, PDFs
 * or another user changed something). `ids` lists the jobs that changed;
 * undefined means "reload everything" (also used after a reconnect, in case a
 * push was missed). No polling: one open Server-Sent Events connection.
 */
function useLiveChanges(onChange: (ids?: number[]) => void) {
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    const events = new EventSource("/api/admin/events");
    let connectedOnce = false;
    events.onopen = () => {
      if (connectedOnce) latest.current();
      connectedOnce = true;
    };
    events.addEventListener("changed", (event) => {
      let ids: number[] | undefined;
      try {
        ids = JSON.parse((event as MessageEvent).data).ids;
      } catch {
        ids = undefined;
      }
      latest.current(ids);
    });
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
        const result = await readJson(response);
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

  // Latest list and range, for merging a live update into what's on screen
  const dataRef = useRef(data);
  dataRef.current = data;
  const rangeKey = `${from}|${to}`;
  const rangeRef = useRef(rangeKey);
  rangeRef.current = rangeKey;

  /** Fetch only the jobs a push named, and merge them into the list. */
  const applyChanges = useCallback(
    async (ids: number[]) => {
      const range = rangeKey;
      try {
        const params = new URLSearchParams({ ids: ids.join(",") });
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const response = await fetch(`/api/admin/patients?${params}`, { cache: "no-store" });
        const result = await readJson(response);
        if (!response.ok) throw new Error(result.error || "Failed to fetch changes");
        if (rangeRef.current !== range) return; // the filter changed meanwhile; that load wins

        const fresh = new Map<number, PatientRecord>((result.data as PatientRecord[]).map((r) => [r.id, r]));
        const requested = new Set(ids);
        const prev = dataRef.current;
        const onScreen = new Set(prev.map((p) => p.id));
        // Changed jobs are replaced; ones no longer in the range drop out; new ones go on top
        const kept = prev.filter((p) => !requested.has(p.id) || fresh.has(p.id)).map((p) => fresh.get(p.id) ?? p);
        const added = [...fresh.values()].filter((r) => !onScreen.has(r.id));
        setData([...added, ...kept]);
        setTotal((t) => t + added.length - (prev.length - kept.length));
        if (result.sync) setSync(result.sync);
      } catch (err) {
        console.error("Error applying live update:", err);
        load(true); // fall back to a full reload of the range
      }
    },
    [from, to, rangeKey, load]
  );

  useLiveChanges((ids) => (ids ? applyChanges(ids) : load(true)));

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
      const result = await readJson(response);
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

  // Only reload when this patient is among the jobs that changed
  useLiveChanges((ids) => {
    if (!ids || ids.includes(Number(id))) load();
  });

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
