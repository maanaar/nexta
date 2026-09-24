"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  FileStack,
  Inbox,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { useSearch } from "@/context/SearchContext";
import type { PatientRecord } from "@/lib/patient-data";
import { getStateMeta } from "@/lib/patient-states";
import { matchesSearch, usePatients } from "@/lib/use-patients";
import { Avatar, Card, ErrorBanner, HeroButton, PageBody, PageHero, StateBadge } from "@/components/ui";

type StatFilter = "all" | "sent" | "pending" | "issues";

const columns = [
  "Patient",
  "WhatsApp",
  "Study",
  "Accession",
  "Created on",
  "Report date",
  "Sent at",
  "Timer",
  "State",
];

function statFilterMatches(filter: StatFilter, state: string) {
  if (filter === "all") return true;
  const meta = getStateMeta(state);
  if (filter === "issues") return meta.isIssue;
  return meta.key === filter;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tint,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-4 rounded-2xl bg-white p-4 text-left shadow-sm shadow-ink-900/5 ring-1 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${
        active ? "ring-2 ring-brand-500" : "ring-slate-200/70"
      }`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-2xl font-bold tabular-nums text-ink-900">{value}</span>
        <span className="block text-sm text-slate-500">{label}</span>
      </span>
    </button>
  );
}

export default function AdminTable() {
  const { data, isLoading, error, refresh } = usePatients();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [statFilter, setStatFilter] = useState<StatFilter>("all");
  const { searchQuery } = useSearch();
  const router = useRouter();

  const counts = useMemo(() => {
    const c = { all: data.length, sent: 0, pending: 0, issues: 0 };
    data.forEach((p) => {
      const meta = getStateMeta(p.state);
      if (meta.key === "sent") c.sent++;
      else if (meta.key === "pending") c.pending++;
      if (meta.isIssue) c.issues++;
    });
    return c;
  }, [data]);

  const filteredData = useMemo(
    () => data.filter((p) => matchesSearch(p, searchQuery) && statFilterMatches(statFilter, p.state)),
    [data, searchQuery, statFilter]
  );

  const groupedData = useMemo(() => {
    return filteredData.reduce((acc, record) => {
      const modality = record.modality && record.modality !== "N/A" ? record.modality : "Unknown";
      (acc[modality] ??= []).push(record);
      return acc;
    }, {} as Record<string, PatientRecord[]>);
  }, [filteredData]);

  const modalities = useMemo(() => Object.keys(groupedData).sort(), [groupedData]);

  // Reset collapse state when fresh data arrives
  useEffect(() => setCollapsed(new Set()), [data]);

  const toggleModality = (modality: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(modality)) next.delete(modality);
      else next.add(modality);
      return next;
    });
  };

  const allCollapsed = modalities.length > 0 && modalities.every((m) => collapsed.has(m));

  const toggleFilter = (filter: StatFilter) => setStatFilter((cur) => (cur === filter ? "all" : filter));

  return (
    <>
      <PageHero
        title="Reports dashboard"
        subtitle="Track every study report from print to WhatsApp delivery."
        actions={
          <HeroButton onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </HeroButton>
        }
      />

      <PageBody>
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label="All studies"
            value={counts.all}
            icon={FileStack}
            tint="bg-brand-50 text-brand-600"
            active={statFilter === "all"}
            onClick={() => setStatFilter("all")}
          />
          <StatCard
            label="Sent"
            value={counts.sent}
            icon={CheckCircle2}
            tint="bg-emerald-50 text-emerald-600"
            active={statFilter === "sent"}
            onClick={() => toggleFilter("sent")}
          />
          <StatCard
            label="In progress"
            value={counts.pending}
            icon={Clock}
            tint="bg-teal-50 text-teal-600"
            active={statFilter === "pending"}
            onClick={() => toggleFilter("pending")}
          />
          <StatCard
            label="Needs attention"
            value={counts.issues}
            icon={AlertTriangle}
            tint="bg-rose-50 text-rose-600"
            active={statFilter === "issues"}
            onClick={() => toggleFilter("issues")}
          />
        </div>

        {error && <ErrorBanner message={error} />}

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-ink-900">Patients by modality</h2>
              <p className="text-sm text-slate-500">
                {isLoading
                  ? "Loading…"
                  : `${filteredData.length} of ${data.length} studies${searchQuery ? ` matching “${searchQuery}”` : ""}`}
              </p>
            </div>
            {modalities.length > 1 && (
              <button
                type="button"
                onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(modalities))}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                {allCollapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}
                {allCollapsed ? "Expand all" : "Collapse all"}
              </button>
            )}
          </div>

          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="whitespace-nowrap px-4 py-3 first:pl-5">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>

              {isLoading ? (
                <tbody>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {columns.map((c) => (
                        <td key={c} className="px-4 py-4 first:pl-5">
                          <div className="h-3.5 w-full max-w-[120px] animate-pulse rounded bg-slate-100" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ) : filteredData.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={columns.length} className="px-5 py-16 text-center">
                      <Inbox className="mx-auto h-10 w-10 text-slate-300" />
                      <p className="mt-3 font-medium text-ink-900">No studies found</p>
                      <p className="text-sm text-slate-500">
                        {searchQuery || statFilter !== "all"
                          ? "Try a different search or clear the filter."
                          : "New print jobs will show up here."}
                      </p>
                    </td>
                  </tr>
                </tbody>
              ) : (
                modalities.map((modality) => {
                  const isOpen = !collapsed.has(modality);
                  return (
                    <tbody key={modality}>
                      <tr
                        onClick={() => toggleModality(modality)}
                        className="cursor-pointer border-t border-slate-200 bg-brand-50/50 transition hover:bg-brand-50"
                      >
                        <td colSpan={columns.length} className="px-5 py-2.5">
                          <div className="flex items-center gap-3">
                            <ChevronDown
                              className={`h-4 w-4 text-brand-600 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                            />
                            <span className="rounded-md bg-brand-600 px-2 py-0.5 text-xs font-bold tracking-wide text-white">
                              {modality}
                            </span>
                            <span className="text-sm text-slate-500">
                              {groupedData[modality].length} studies
                            </span>
                          </div>
                        </td>
                      </tr>

                      {isOpen &&
                        groupedData[modality].map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => router.push(`/patient/${row.id}`)}
                            className="cursor-pointer border-t border-slate-100 transition hover:bg-teal-50/40"
                          >
                            <td className="py-3 pl-5 pr-4">
                              <div className="flex items-center gap-3">
                                <Avatar name={row.patientName} size="sm" />
                                <div className="min-w-0">
                                  <p className="max-w-[200px] truncate font-semibold text-ink-900">
                                    {row.patientName}
                                  </p>
                                  <p className="text-xs text-slate-500">ID {row.patientId}</p>
                                </div>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.whatsappNum}</td>
                            <td className="px-4 py-3 text-slate-600">
                              <span className="block max-w-[220px] truncate">{row.studyDesc}</span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                              {row.accessionNum}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.createdOn}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.reportCreationDate}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.sentAt}</td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-slate-600">
                              {row.timer}
                            </td>
                            <td className="px-4 py-3">
                              <StateBadge state={row.state} />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  );
                })
              )}
            </table>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
