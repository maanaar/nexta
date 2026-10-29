"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { toDateKey } from "@/lib/date-filter";

const WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const parse = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const show = (key: string) => parse(key).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type Props = { from: string; to: string; onChange: (from: string, to: string) => void };

/**
 * One calendar for a single day or a period: click a day, then (optionally) a second day for a period.
 * Clicking the same day twice, or pressing Done, keeps just that day.
 */
export default function DateRangePicker({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = from ? parse(from) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [anchor, setAnchor] = useState<string | null>(null); // the first day of a pick in progress
  const [hover, setHover] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const today = toDateKey(new Date());

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setOpen(false);
    setAnchor(null);
    setHover(null);
  };

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1 - view.getDay());
    return Array.from({ length: 42 }, (_, i) => toDateKey(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)));
  }, [view]);

  // What is highlighted: the pick in progress (anchor to the day under the mouse), else the chosen period
  const [lo, hi] = anchor && hover ? (hover < anchor ? [hover, anchor] : [anchor, hover]) : [from, to || from];

  const pick = (key: string) => {
    if (!anchor) {
      onChange(key, key);
      setAnchor(key);
      return;
    }
    const [a, b] = key < anchor ? [key, anchor] : [anchor, key];
    onChange(a, b);
    close();
  };

  const label = !from ? "Pick a date" : !to || from === to ? show(from) : `${show(from)} → ${show(to)}`;
  const monthName = view.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const step = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-ink-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-white/30"
      >
        <CalendarDays className="h-4 w-4 text-brand-600" />
        {label}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[19rem] rounded-2xl bg-white p-3 text-ink-900 shadow-2xl ring-1 ring-slate-200">
          <div className="flex items-center justify-between pb-2">
            <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-bold">{monthName}</p>
            <button type="button" onClick={() => step(1)} aria-label="Next month" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase text-slate-400">
            {WEEK.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7" onMouseLeave={() => setHover(null)}>
            {cells.map((key) => {
              const inMonth = parse(key).getMonth() === view.getMonth();
              const isEdge = !!lo && (key === lo || key === hi);
              const inRange = !!lo && key >= lo && key <= hi;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pick(key)}
                  onMouseEnter={() => setHover(key)}
                  className={`relative h-9 text-sm tabular-nums transition ${
                    isEdge
                      ? "z-10 rounded-lg bg-brand-600 font-bold text-white"
                      : inRange
                        ? "bg-brand-100 text-brand-700"
                        : inMonth
                          ? "rounded-lg text-ink-900 hover:bg-slate-100"
                          : "rounded-lg text-slate-300 hover:bg-slate-50"
                  } ${key === today && !isEdge ? "font-bold ring-1 ring-inset ring-brand-400" : ""}`}
                >
                  {parse(key).getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <p className="text-xs text-slate-500">{anchor ? "Click another day for a period, or Done for this day." : "Click a day, then another day for a period."}</p>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onChange(today, today);
                  setView(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                  close();
                }}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Today
              </button>
              <button type="button" onClick={close} className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-500">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
