'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Hash, IdCard, RefreshCw } from 'lucide-react';
import { useSearch } from '@/context/SearchContext';
import type { PatientRecord } from '@/lib/patient-data';
import { STATE_ORDER, STATES, getStateKey, type StateKey } from '@/lib/patient-states';
import { matchesSearch, usePatients } from '@/lib/use-patients';
import { Avatar, ErrorBanner, HeroButton, PageBody, PageHero } from '@/components/ui';

export default function PatientBoard() {
  const { data, isLoading, error, refresh } = usePatients();
  const { searchQuery } = useSearch();
  const router = useRouter();

  const grouped = useMemo(() => {
    const groups = Object.fromEntries(STATE_ORDER.map((key) => [key, [] as PatientRecord[]])) as Record<
      StateKey,
      PatientRecord[]
    >;
    data
      .filter((p) => matchesSearch(p, searchQuery))
      .forEach((p) => groups[getStateKey(p.state)].push(p));
    return groups;
  }, [data, searchQuery]);

  return (
    <>
      <PageHero
        title="Delivery board"
        subtitle="See where every report is in the WhatsApp delivery pipeline."
        actions={
          <HeroButton onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </HeroButton>
        }
      />

      <PageBody>
        {error && <ErrorBanner message={error} />}

        <div className="scroll-thin -mx-4 flex snap-x items-start gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          {STATE_ORDER.map((key) => {
            const meta = STATES[key];
            const patients = grouped[key];

            return (
              <section
                key={key}
                className={`flex max-h-[calc(100vh-14rem)] w-80 shrink-0 snap-start flex-col rounded-2xl border-t-4 bg-slate-50 shadow-sm shadow-ink-900/5 ring-1 ring-slate-200/70 ${meta.accent}`}
              >
                <header className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                    <h2 className="font-semibold text-ink-900">{meta.label}</h2>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${meta.badge}`}>
                    {isLoading ? '–' : patients.length}
                  </span>
                </header>

                <div className="scroll-thin flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
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
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => router.push(`/patient/${p.id}`)}
                        className="group rounded-xl border border-slate-200/80 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          <Avatar name={p.patientName} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate font-semibold text-ink-900 group-hover:text-brand-600">
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
                      </button>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
