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

type Props = {
  /** YYYY-MM-DD, or "" for none */
  value: string;
  onChange: (day: string) => void;
  /** Days before / after these are greyed out and can't be picked */
  min?: string;
  max?: string;
  placeholder?: string;
};

/** One day, picked from a month calendar that opens under the button. Picking a day closes it. */
export default function DatePicker({ value, onChange, min, max, placeholder = "Pick a date" }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = value ? parse(value) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const box = useRef<HTMLDivElement>(null);
  // Opens towards the left when there is no room on the right of the button
  const [alignRight, setAlignRight] = useState(false);
  const today = toDateKey(new Date());

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1 - view.getDay());
    return Array.from({ length: 42 }, (_, i) => toDateKey(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)));
  }, [view]);

  const toggle = () => {
    if (!open) {
      const d = value ? parse(value) : new Date();
      setView(new Date(d.getFullYear(), d.getMonth(), 1));
      const left = box.current?.getBoundingClientRect().left ?? 0;
      setAlignRight(left + 304 > window.innerWidth - 8);
    }
    setOpen(!open);
  };
  const step = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));
  const monthName = view.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const blocked = (key: string) => (!!min && key < min) || (!!max && key > max);
  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-ink-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-white/30"
      >
        <CalendarDays className="h-4 w-4 text-brand-600" />
        {value ? show(value) : placeholder}
      </button>

      {open && (
        <div className={`absolute top-full z-50 mt-2 w-[19rem] ${alignRight ? "right-0" : "left-0"} rounded-2xl bg-white p-3 text-ink-900 shadow-2xl ring-1 ring-slate-200`}>
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
          <div className="grid grid-cols-7">
            {cells.map((key) => {
              const inMonth = parse(key).getMonth() === view.getMonth();
              const selected = key === value;
              const off = blocked(key);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={off}
                  onClick={() => pick(key)}
                  className={`h-9 rounded-lg text-sm tabular-nums transition ${
                    selected
                      ? "bg-brand-600 font-bold text-white"
                      : off
                        ? "cursor-not-allowed text-slate-200"
                        : inMonth
                          ? "text-ink-900 hover:bg-slate-100"
                          : "text-slate-300 hover:bg-slate-50"
                  } ${key === today && !selected ? "font-bold ring-1 ring-inset ring-brand-400" : ""}`}
                >
                  {parse(key).getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-end border-t border-slate-100 pt-2">
            <button
              type="button"
              disabled={blocked(today)}
              onClick={() => pick(today)}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
