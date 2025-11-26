"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type StateCounts = Record<string, number>;

const pillColors: Record<string, string> = {
  sent: "from-[#16A34A]/70 to-[#22C55E]/70",
  Missing: "from-[#f97316]/70 to-[#fb923c]/70",
  InProgress: "from-[#0ea5e9]/70 to-[#38bdf8]/70",
  default: "from-[#94a3b8]/70 to-[#cbd5f5]/70",
};

export default function PatientStateBar({ activeState }: { activeState?: string }) {
  const [stateCounts, setStateCounts] = useState<StateCounts>({});
  const router = useRouter();

  useEffect(() => {
    let canceled = false;
    fetch("/api/admin/patients")
      .then((res) => res.json())
      .then((payload) => {
        if (canceled) return;
        const counts: StateCounts = {};
        (payload?.data || []).forEach((patient: any) => {
          const state = patient.state || "Unknown";
          counts[state] = (counts[state] || 0) + 1;
        });
        setStateCounts(counts);
      })
      .catch((err) => {
        console.error("Failed to load patient states", err);
      });

    return () => {
      canceled = true;
    };
  }, []);

  const entries = useMemo(
    () =>
      Object.entries(stateCounts).sort(([a], [b]) => a.localeCompare(b)),
    [stateCounts]
  );

  if (!entries.length) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {entries.map(([state, count]) => {
        const colors = pillColors[state] ?? pillColors.default;
        const isActive = activeState === state;
        return (
          <button
            key={state}
            className={`rounded-full bg-linear-to-r ${colors} px-4 py-1.5 text-xs sm:text-sm font-semibold text-white shadow ${
              isActive ? "ring-2 ring-white" : "hover:scale-[1.02]"
            }`}
            onClick={() => router.push(`/organizer?state=${encodeURIComponent(state)}`)}
          >
            {state} ({count})
          </button>
        );
      })}
    </div>
  );
}

