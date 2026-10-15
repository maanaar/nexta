'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, GripVertical, Hash, IdCard, RefreshCw } from 'lucide-react';
import { useSearch } from '@/context/SearchContext';
import DateFilterBar from '@/components/DateFilterBar';
import type { PatientRecord } from '@/lib/patient-data';
import { matchesDate } from '@/lib/date-filter';
import { STATE_ORDER, STATES, getStateKey, type StateKey } from '@/lib/patient-states';
import { matchesSearch, usePatients } from '@/lib/use-patients';
import { Avatar, ErrorBanner, HeroButton, PageBody, PageHero, SyncNotice, TruncatedNotice } from '@/components/ui';

type Toast = { kind: 'success' | 'error'; message: string };

// A number that is stored but not valid doesn't count
const hasPhone = (p: PatientRecord) => p.phoneValid;

/** Why a card can't go into a column, or null if it can. Mirrors the server's rules. */
function blockedReason(p: PatientRecord, target: StateKey): string | null {
  if (getStateKey(p.state) === target) return 'Already here';
  if (target === 'waiting') return 'Set automatically until the PDF is found';
  if ((target === 'pending' || target === 'no_number') && p.pdfs.length === 0) return "PDF hasn't been found yet";
  if (target === 'pending' && !hasPhone(p)) return 'Needs a valid WhatsApp number';
  if (target === 'no_number' && hasPhone(p)) return 'Has a valid WhatsApp number';
  return null;
}

export default function PatientBoard() {
  const { searchQuery, dateFilter } = useSearch();
  const { data, total, sync, isLoading, error, refresh, replaceRecord } = usePatients(dateFilter);
  const router = useRouter();

  const [dragged, setDragged] = useState<PatientRecord | null>(null);
  const [overColumn, setOverColumn] = useState<StateKey | null>(null);
  // Optimistic moves: shown in the new column while the server confirms
  const [pendingMoves, setPendingMoves] = useState<Record<number, StateKey>>({});
  const [toast, setToast] = useState<Toast | null>(null);

  // Sideways sliding when the columns don't all fit. Columns are sized so a whole
  // number of them fills the board exactly: no column is ever shown cut off.
  const COLUMN_MIN = 288; // px, the narrowest a column gets
  const COLUMN_GAP = 16; // px, matches gap-4
  const boardRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ perView: STATE_ORDER.length, width: COLUMN_MIN });
  const [canSlide, setCanSlide] = useState({ left: false, right: false });
  const lastDragSlide = useRef(0);

  const updateSlide = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    setCanSlide({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => {
      // How many whole columns fit, then stretch them to fill the board exactly
      const perView = Math.max(
        1,
        Math.min(STATE_ORDER.length, Math.floor((el.clientWidth + COLUMN_GAP) / (COLUMN_MIN + COLUMN_GAP)))
      );
      const width = (el.clientWidth - COLUMN_GAP * (perView - 1)) / perView;
      setLayout((prev) => (prev.perView === perView && Math.abs(prev.width - width) < 0.5 ? prev : { perView, width }));
      updateSlide();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateSlide]);

  // A resize changes the column width: keep the first visible column aligned
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const step = layout.width + COLUMN_GAP;
    el.scrollTo({ left: Math.round(el.scrollLeft / step) * step });
    updateSlide();
  }, [layout, updateSlide]);

  /** One page of whole columns per click; the last page ends on the last column. */
  const slide = (direction: 1 | -1) => {
    const el = boardRef.current;
    if (!el) return;
    const step = layout.width + COLUMN_GAP;
    const first = Math.round(el.scrollLeft / step);
    const target = Math.max(0, Math.min(first + direction * layout.perView, STATE_ORDER.length - layout.perView));
    el.scrollTo({ left: target * step, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const grouped = useMemo(() => {
    const groups = Object.fromEntries(STATE_ORDER.map((key) => [key, [] as PatientRecord[]])) as Record<
      StateKey,
      PatientRecord[]
    >;
    data
      .filter((p) => matchesSearch(p, searchQuery) && matchesDate(p.createdOn, dateFilter))
      .forEach((p) => groups[pendingMoves[p.id] ?? getStateKey(p.state)].push(p));
    return groups;
  }, [data, searchQuery, dateFilter, pendingMoves]);

  const moveCard = async (patient: PatientRecord, target: StateKey) => {
    const meta = STATES[target];
    setPendingMoves((m) => ({ ...m, [patient.id]: target }));
    try {
      const res = await fetch(`/api/admin/patients/${patient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: meta.dbState }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not move the card');
      replaceRecord(result.data);
      setToast({ kind: 'success', message: `${patient.patientName} moved to ${meta.label}` });
    } catch (err: any) {
      setToast({ kind: 'error', message: err.message });
    } finally {
      setPendingMoves((m) => {
        const { [patient.id]: _, ...rest } = m;
        return rest;
      });
    }
  };

  const endDrag = () => {
    setDragged(null);
    setOverColumn(null);
  };

  return (
    <>
      <PageHero
        title="Delivery board"
        subtitle="Drag a card to another column to change its status."
        actions={
          <>
            <DateFilterBar />
            <HeroButton onClick={refresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </HeroButton>
          </>
        }
      />

      <PageBody fluid>
        {error && <ErrorBanner message={error} />}
        <SyncNotice sync={sync} />
        <TruncatedNotice shown={data.length} total={total} />

        {/* A whole number of columns fills the width; arrows page to the rest */}
        <div className="relative">
          {(['left', 'right'] as const).map((side) =>
            canSlide[side] ? (
              <button
                key={side}
                type="button"
                aria-label={side === 'left' ? 'Show earlier columns' : 'Show more columns'}
                onClick={() => slide(side === 'left' ? -1 : 1)}
                // While dragging a card, holding it over the arrow pages the board
                onDragOver={(e) => {
                  e.preventDefault();
                  if (Date.now() - lastDragSlide.current > 700) {
                    lastDragSlide.current = Date.now();
                    slide(side === 'left' ? -1 : 1);
                  }
                }}
                // In the page margin beside the column headers on desktop (never over a
                // column's count); on narrow screens just over the cards' edge
                className={`absolute top-14 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-900 shadow-lg shadow-ink-900/15 ring-1 ring-slate-200 transition hover:scale-105 hover:text-brand-600 lg:top-2 ${
                  side === 'left' ? '-left-3 lg:-left-10' : '-right-3 lg:-right-10'
                }`}
              >
                {side === 'left' ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              </button>
            ) : null
          )}

        <div
          ref={boardRef}
          onScroll={updateSlide}
          // Snapping keeps manual (trackpad) scrolling on whole columns too
          className="scroll-thin relative flex w-full snap-x snap-mandatory items-start gap-4 overflow-x-auto pb-4"
        >
          {STATE_ORDER.map((key) => {
            const meta = STATES[key];
            const patients = grouped[key];
            const reason = dragged ? blockedReason(dragged, key) : null;
            const isSource = dragged ? getStateKey(dragged.state) === key : false;
            const canDrop = !!dragged && !reason;
            const isOver = canDrop && overColumn === key;

            return (
              <section
                key={key}
                style={{ width: layout.width }}
                onDragOver={(e) => {
                  if (!canDrop) return; // not calling preventDefault = drop not allowed
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (overColumn !== key) setOverColumn(key);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverColumn(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragged && canDrop) moveCard(dragged, key);
                  endDrag();
                }}
                className={`@container flex max-h-[calc(100vh-14rem)] shrink-0 snap-start flex-col rounded-2xl border-t-4 shadow-sm shadow-ink-900/5 transition ${meta.accent} ${
                  isOver
                    ? 'bg-brand-50 ring-2 ring-brand-400'
                    : canDrop
                      ? 'bg-slate-50 ring-2 ring-brand-200'
                      : 'bg-slate-50 ring-1 ring-slate-200/70'
                } ${dragged && !canDrop && !isSource ? 'opacity-50' : ''}`}
              >
                <header className="flex items-center justify-between gap-2 px-3 py-3 @[15rem]:px-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                    <h2 className="font-semibold leading-tight text-ink-900">{meta.label}</h2>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${meta.badge}`}>
                    {isLoading ? '–' : patients.length}
                  </span>
                </header>

                {dragged && !isSource && (
                  <p
                    className={`mx-3 mb-2 rounded-lg px-3 py-1.5 text-center text-xs font-medium ${
                      canDrop ? 'bg-brand-100/70 text-brand-700' : 'bg-slate-200/70 text-slate-500'
                    }`}
                  >
                    {canDrop ? 'Drop here' : reason}
                  </p>
                )}

                <div className="scroll-thin flex flex-1 flex-col gap-2.5 overflow-y-auto px-2 pb-3 @[15rem]:px-3">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                    ))
                  ) : patients.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
                      Nothing here
                    </div>
                  ) : (
                    patients.map((p) => (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(p.id));
                          e.dataTransfer.effectAllowed = 'move';
                          setDragged(p);
                        }}
                        onDragEnd={endDrag}
                        onClick={() => router.push(`/patient/${p.id}`)}
                        onKeyDown={(e) => e.key === 'Enter' && router.push(`/patient/${p.id}`)}
                        className={`group cursor-grab rounded-xl border border-slate-200/80 bg-white p-3 @[15rem]:p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20 active:cursor-grabbing ${
                          dragged?.id === p.id ? 'opacity-40' : ''
                        } ${pendingMoves[p.id] ? 'animate-pulse' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Avatar only when the column is wide enough; narrow columns keep the name readable */}
                          <span className="hidden @[15rem]:inline-flex">
                            <Avatar name={p.patientName} size="sm" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-3 break-words font-semibold leading-snug text-ink-900 group-hover:text-brand-600">
                              {p.patientName}
                            </p>
                            <div className="mt-1 flex min-w-0 items-center gap-1.5">
                              {p.modality && p.modality !== 'N/A' && (
                                <span className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">
                                  {p.modality}
                                </span>
                              )}
                              <p className="truncate text-xs text-slate-500">{p.studyDesc}</p>
                            </div>
                          </div>
                          <GripVertical className="-mr-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-400" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <IdCard className="h-3.5 w-3.5" />
                            {p.patientId}
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <Hash className="h-3.5 w-3.5" />
                            {p.accessionNum}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
        </div>
      </PageBody>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${
            toast.kind === 'success' ? 'bg-ink-900' : 'bg-rose-600'
          }`}
        >
          {toast.kind === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-teal-300" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}
    </>
  );
}
