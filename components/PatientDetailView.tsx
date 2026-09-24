"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Hash, IdCard, MessageCircle, Stethoscope, X } from "lucide-react";
import PatientPdfViewer from "./PatientPdfViewer";
import type { PatientRecord } from "@/lib/patient-data";
import { getStateMeta } from "@/lib/patient-states";
import { usePatients } from "@/lib/use-patients";
import { Avatar, Card, ErrorBanner, PageBody, PageHero, StateBadge } from "@/components/ui";

type StepStatus = "done" | "current" | "error" | "upcoming";

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`text-right text-sm font-medium text-ink-900 ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

function Step({
  title,
  detail,
  status,
  last,
}: {
  title: string;
  detail?: string;
  status: StepStatus;
  last?: boolean;
}) {
  const bubble = {
    done: "bg-emerald-500 text-white",
    current: "bg-brand-500 text-white ring-4 ring-brand-500/20",
    error: "bg-rose-500 text-white ring-4 ring-rose-500/20",
    upcoming: "bg-slate-100 text-slate-400",
  }[status];

  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {!last && (
        <span
          className={`absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 ${
            status === "done" ? "bg-emerald-300" : "bg-slate-200"
          }`}
        />
      )}
      <span className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${bubble}`}>
        {status === "done" && <Check className="h-4 w-4" />}
        {status === "error" && <X className="h-4 w-4" />}
        {status === "current" && <span className="h-2 w-2 animate-pulse rounded-full bg-white" />}
      </span>
      <div className="pt-0.5">
        <p className={`text-sm font-semibold ${status === "upcoming" ? "text-slate-400" : "text-ink-900"}`}>
          {title}
        </p>
        {detail && (
          <p className={`text-xs ${status === "error" ? "text-rose-600" : "text-slate-500"}`}>{detail}</p>
        )}
      </div>
    </li>
  );
}

export default function PatientDetailView({ patientId }: { patientId: string }) {
  const { data, isLoading, error } = usePatients();
  const [patient, setPatient] = useState<PatientRecord | null>(null);

  useEffect(() => {
    setPatient(data.find((item) => item.id.toString() === patientId) ?? null);
  }, [data, patientId]);

  const handleWhatsappChange = (newValue: string) => {
    if (!patient) return;
    const updated = { ...patient, whatsappNum: newValue };
    // A number was entered, so the report can be queued again
    if (newValue.trim() !== "") updated.state = "Inprogress";
    setPatient(updated);
  };

  const steps = useMemo(() => {
    if (!patient) return [];
    const meta = getStateMeta(patient.state);
    const queued: StepStatus =
      meta.key === "sent" ? "done" : meta.isIssue ? "error" : meta.key === "pending" ? "current" : "upcoming";
    return [
      { title: "Report created", detail: patient.reportCreationDate, status: "done" as StepStatus },
      {
        title: "Queued for WhatsApp",
        detail: meta.isIssue ? meta.label : meta.key === "pending" ? `Waiting · ${patient.timer}` : undefined,
        status: queued,
      },
      {
        title: "Delivered",
        detail: meta.key === "sent" ? patient.sentAt : undefined,
        status: (meta.key === "sent" ? "done" : "upcoming") as StepStatus,
      },
    ];
  }, [patient]);

  const backLink = (
    <Link
      href="/admin"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-white/80 transition hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to dashboard
    </Link>
  );

  if (isLoading || !patient) {
    return (
      <>
        <PageHero title={isLoading ? "Loading patient…" : "Patient not found"}>{backLink}</PageHero>
        <PageBody>
          {error && <ErrorBanner message={error} />}
          <Card className="p-10 text-center text-slate-500">
            {isLoading ? (
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
            ) : (
              "We couldn't find this patient. They may have been removed from the print queue."
            )}
          </Card>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHero
        title={
          <span className="flex items-center gap-4">
            <Avatar name={patient.patientName} size="lg" />
            <span>{patient.patientName}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="flex items-center gap-1.5">
              <IdCard className="h-4 w-4" /> {patient.patientId}
            </span>
            <span className="flex items-center gap-1.5 font-mono">
              <Hash className="h-4 w-4" /> {patient.accessionNum}
            </span>
            <span className="flex items-center gap-1.5">
              <Stethoscope className="h-4 w-4" /> {patient.modality} · {patient.studyDesc}
            </span>
          </span>
        }
        actions={
          <span className="rounded-full bg-white p-0.5">
            <StateBadge state={patient.state} />
          </span>
        }
      >
        {backLink}
      </PageHero>

      <PageBody>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6">
            <Card className="p-5">
              <h2 className="mb-4 font-semibold text-ink-900">Delivery progress</h2>
              <ol>
                {steps.map((step, i) => (
                  <Step key={step.title} {...step} last={i === steps.length - 1} />
                ))}
              </ol>
            </Card>

            <Card className="p-5">
              <label htmlFor="whatsapp" className="mb-2 flex items-center gap-2 font-semibold text-ink-900">
                <MessageCircle className="h-4 w-4 text-teal-500" />
                WhatsApp number
              </label>
              <input
                id="whatsapp"
                type="tel"
                value={patient.whatsappNum === "N/A" ? "" : patient.whatsappNum}
                placeholder="e.g. +20 100 000 0000"
                onChange={(e) => handleWhatsappChange(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-ink-900 transition focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-400/20"
              />
              <p className="mt-2 text-xs text-slate-500">Adding a number puts the report back in the send queue.</p>
            </Card>

            <Card className="px-5 py-3">
              <h2 className="py-2 font-semibold text-ink-900">Study details</h2>
              <dl className="divide-y divide-slate-100">
                <DetailRow label="Modality" value={patient.modality} />
                <DetailRow label="Study" value={patient.studyDesc} />
                <DetailRow label="Created on" value={patient.createdOn} />
                <DetailRow label="Report date" value={patient.reportCreationDate} />
                <DetailRow label="Sent at" value={patient.sentAt} />
                <DetailRow label="Timer" value={patient.timer} mono />
              </dl>
            </Card>
          </div>

          <Card className="p-5 lg:col-span-2">
            {patient.pdfUrl ? (
              <PatientPdfViewer pdfUrl={patient.pdfUrl} />
            ) : (
              <div className="py-20 text-center text-sm text-slate-500">No report PDF available yet.</div>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
