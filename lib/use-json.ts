"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads JSON from an API route and keeps it until `url` changes. `reload()` fetches again (without blanking
 * the screen); `refreshKey` reloads whenever it changes. Pass null to do nothing.
 */
export function useJson<T>(url: string | null, refreshKey?: unknown) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    if (!url) return;
    const id = ++latest.current;
    setLoading(true);
    try {
      const response = await fetch(url, { cache: "no-store" });
      const text = await response.text();
      let body: any = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { error: `Server error ${response.status}` };
      }
      if (id !== latest.current) return; // a newer request replaced this one
      if (!response.ok) throw new Error(body.error || "Something went wrong");
      setData(body.data as T);
      setError(null);
    } catch (err: any) {
      if (id === latest.current) setError(err.message || "Something went wrong");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  return { data, error, loading, reload };
}
