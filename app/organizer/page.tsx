'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  GripVertical,
  Hash,
  Hourglass,
  IdCard,
  Inbox,
  MessageCircleOff,
  Package,
  PhoneOff,
  RefreshCw,
  Send,
  UserRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useSearch } from '@/context/SearchContext';
import DateFilterBar from '@/components/DateFilterBar';
import type { PatientRecord } from '@/lib/patient-data';
import { describeDateFilter, matchesDate } from '@/lib/date-filter';
import { STATE_ORDER, STATES, getStateKey, type StateKey } from '@/lib/patient-states';
import { matchesSearch, usePatients } from '@/lib/use-patients';
import { Avatar, ErrorBanner, HeroButton, PageBody, PageHero, SyncNotice, TruncatedNotice } from '@/components/ui';

type Toast = { kind: 'success' | 'error'; message: string };

/** Pastel look per column: icon, tinted background and top border. */
const COLUMN_STYLE: Record<StateKey, { icon: LucideIcon; tint: string; iconBox: string; empty: string; hover: string }> = {
  waiting: {
    icon: Hourglass,
    tint: 'bg-linear-to-b from-violet-50/80 to-white border-t-violet-400',
    iconBox: 'bg-violet-100 text-violet-600',
    empty: 'border-violet-200 text-violet-400',
    hover: 'hover:border-violet-300 hover:bg-violet-50 hover:shadow-violet-200/70',
  },
  no_number: {
    icon: UserRound,
    tint: 'bg-linear-to-b from-orange-50/80 to-white border-t-orange-400',
    iconBox: 'bg-orange-100 text-orange-600',
    empty: 'border-orange-200 text-orange-400',
    hover: 'hover:border-orange-300 hover:bg-orange-50 hover:shadow-orange-200/70',
  },
  pending: {
    icon: Send,
    tint: 'bg-linear-to-b from-brand-50 to-white border-t-brand-500',
    iconBox: 'bg-brand-100 text-brand-600',
    empty: 'border-brand-200 text-brand-400',
    hover: 'hover:border-brand-300 hover:bg-brand-50 hover:shadow-brand-200/70',
  },
  sent: {
    icon: CheckCircle2,
    tint: 'bg-linear-to-b from-emerald-50/80 to-white border-t-emerald-500',
    iconBox: 'bg-emerald-100 text-emerald-600',
    empty: 'border-emerald-200 text-emerald-400',
    hover: 'hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-emerald-200/70',
  },
  failed: {
    icon: XCircle,
    tint: 'bg-linear-to-b from-rose-50/80 to-white border-t-rose-500',
    iconBox: 'bg-rose-100 text-rose-600',
    empty: 'border-rose-200 text-rose-400',
    hover: 'hover:border-rose-300 hover:bg-rose-50 hover:shadow-rose-200/70',
  },
  no_whatsapp: {
    icon: PhoneOff,
    tint: 'bg-linear-to-b from-amber-50/80 to-white border-t-amber-500',
    iconBox: 'bg-amber-100 text-amber-600',
    empty: 'border-amber-200 text-amber-400',
    hover: 'hover:border-amber-300 hover:bg-amber-50 hover:shadow-amber-200/70',
  },
  signed_out: {
    icon: MessageCircleOff,
    tint: 'bg-linear-to-b from-fuchsia-50/80 to-white border-t-fuchsia-400',
    iconBox: 'bg-fuchsia-100 text-fuchsia-600',
    empty: 'border-fuchsia-200 text-fuchsia-400',
    hover: 'hover:border-fuchsia-300 hover:bg-fuchsia-50 hover:shadow-fuchsia-200/70',
  },
};

const hasPhone =(p: PatientRecord) => p.whatsappNum !== 'N/A';

/** Why a card can't go into a column, or null if it can. Mirrors the server's rules. */
function blockedReason(p: PatientRecord, target: StateKey): string | null {
  if (getStateKey(p.state) === target) return 'Already here';
  if (target === 'waiting') return 'Set automatically until the PDF is found';
  if ((target === 'pending' || target === 'no_number') && p.pdfs.length === 0) return "PDF hasn't been found yet";
  if (target === 'pending' && !hasPhone(p)) return 'Needs a WhatsApp number';
  if (target === 'no_number' && hasPhone(p)) return 'Has a WhatsApp number';
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

  // Summary row, counted from the same filtered cards the columns show
  const stats = useMemo(() => {
    const count = (...keys: StateKey[]) => keys.reduce((sum, k) => sum + grouped[k].length, 0);
    return [
      {
        label: 'Total Documents',
        value: count(...STATE_ORDER),
        caption: describeDateFilter(dateFilter),
        icon: FileText,
        iconBox: 'bg-brand-50 text-brand-500',
      },
      {
        label: 'Pending',
        value: count('waiting', 'no_number'),
        caption: 'Needs review',
        icon: Hourglass,
        iconBox: 'bg-orange-50 text-orange-500',
      },
      {
        label: 'Ready to Send',
        value: count('pending'),
        caption: 'Ready for delivery',
        icon: Send,
        iconBox: 'bg-brand-50 text-brand-500',
      },
      {
        label: 'Sent',
        value: count('sent'),
        caption: 'Successfully delivered',
        icon: CheckCircle2,
        iconBox: 'bg-emerald-50 text-emerald-500',
      },
      {
        label: 'Failed',
        value: count('failed', 'no_whatsapp', 'signed_out'),
        caption: 'Delivery failed',
        icon: XCircle,
        iconBox: 'bg-rose-50 text-rose-500',
      },
    ];
  }, [grouped, dateFilter]);

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
        compact
        icon={<Package className="h-14 w-14 shrink-0 text-white" strokeWidth={1.5} />}
        title="Delivery board"
        subtitle="Drag a card to another column to change its status."
        actions={
          <>
            <DateFilterBar pill />
            <HeroButton pill onClick={refresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </HeroButton>
          </>
        }
      />

      <PageBody light>
        {error && <ErrorBanner message={error} />}
        <SyncNotice sync={sync} />
        <TruncatedNotice shown={data.length} total={total} />

        <div className="mb-5 grid grid-cols-2 gap-y-5 rounded-2xl border border-slate-200/70 bg-white/90 px-2 py-5 shadow-md shadow-ink-900/5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-y-0">
          {stats.map(({ label, value, caption, icon: StatIcon, iconBox }) => (
            <div
              key={label}
              className="flex items-center gap-4 px-4 lg:border-l lg:border-slate-200/80 lg:first:border-l-0"
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBox}`}>
                <StatIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{label}</p>
                <p className="text-3xl font-bold leading-tight text-ink-900">{isLoading ? '–' : value}</p>
                <p className="block text-xs text-slate-500 first-letter:uppercase">{caption}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="scroll-thin -mx-4 flex snap-x items-start gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          {STATE_ORDER.map((key) => {
            const meta = STATES[key];
            const style = COLUMN_STYLE[key];
            const Icon = style.icon;
            const patients = grouped[key];
            const reason = dragged ? blockedReason(dragged, key) : null;
            const isSource = dragged ? getStateKey(dragged.state) === key : false;
            const canDrop = !!dragged && !reason;
            const isOver = canDrop && overColumn === key;

            return (
              <section
                key={key}
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
                className={`flex max-h-[calc(100vh-14rem)] w-80 shrink-0 snap-start flex-col rounded-2xl border-t-4 shadow-md shadow-ink-900/5 transition ${style.tint} ${
                  isOver
                    ? 'ring-2 ring-brand-400'
                    : canDrop
                      ? 'ring-2 ring-brand-200'
                      : 'ring-1 ring-slate-200/60'
                } ${dragged && !canDrop && !isSource ? 'opacity-50' : ''}`}
              >
                <header className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${style.iconBox}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <h2 className="font-semibold text-ink-900">{meta.label}</h2>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${meta.badge}`}>
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

                <div className="scroll-thin flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                    ))
                  ) : patients.length === 0 ? (
                    <div
                      className={`flex flex-col items-center gap-3 rounded-xl border border-dashed px-3 py-10 text-center text-sm ${style.empty}`}
                    >
                      <Inbox className="h-9 w-9" />
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
                        className={`group cursor-grab rounded-xl border border-slate-200/80 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${style.hover} focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20 active:cursor-grabbing ${
                          dragged?.id === p.id ? 'opacity-40' : ''
                        } ${pendingMoves[p.id] ? 'animate-pulse' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar name={p.patientName} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate font-semibold text-ink-900 group-hover:text-ink-900">
                                {p.patientName}
                              </p>
                              {p.modality && p.modality !== 'N/A' && (
                                <span className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">
                                  {p.modality}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{p.studyDesc}</p>
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
