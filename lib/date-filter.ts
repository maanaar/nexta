// Date filter shared by the dashboard and the organizer board.
// Filters on the "Job or study date" (the same date ETIAM's Print Jobs window shows).

export type DatePreset = "today" | "yesterday" | "7d" | "all" | "custom";

export type DateFilter = {
  preset: DatePreset;
  /** YYYY-MM-DD, only used for "custom" */
  from: string;
  to: string;
};

export const DEFAULT_DATE_FILTER: DateFilter = { preset: "today", from: "", to: "" };

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
];

/** Local calendar date as YYYY-MM-DD */
export function toDateKey(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateKey(d);
}

/** Inclusive [from, to] range for a filter; null means open-ended. */
export function dateRange(filter: DateFilter): { from: string | null; to: string | null } {
  switch (filter.preset) {
    case "today":
      return { from: daysAgo(0), to: daysAgo(0) };
    case "yesterday":
      return { from: daysAgo(1), to: daysAgo(1) };
    case "7d":
      return { from: daysAgo(6), to: daysAgo(0) };
    case "custom":
      return { from: filter.from || null, to: filter.to || null };
    default:
      return { from: null, to: null };
  }
}

/** date is "YYYY-MM-DD" (or "N/A" when ETIAM had none) */
export function matchesDate(date: string, filter: DateFilter) {
  const { from, to } = dateRange(filter);
  if (!from && !to) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return (!from || date >= from) && (!to || date <= to);
}

export function describeDateFilter(filter: DateFilter) {
  if (filter.preset !== "custom") return DATE_PRESETS.find((p) => p.value === filter.preset)!.label.toLowerCase();
  if (filter.from && filter.to) return filter.from === filter.to ? filter.from : `${filter.from} → ${filter.to}`;
  if (filter.from) return `from ${filter.from}`;
  if (filter.to) return `until ${filter.to}`;
  return "all";
}
