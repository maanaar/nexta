"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Hash, IdCard, Loader2, MessageCircle, Stethoscope, X } from "lucide-react";
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
  const [phoneDraft, setPhoneDraft] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const found = useMemo(() => data.find((item) => item.id.toString() === patientId) ?? null, [data, patientId]);

  // Last number received from the server, so polling doesn't overwrite what the user is typing
  const syncedPhone = useRef("");

  useEffect(() => {
    if (!found) return;
    setPatient(found);
    const phone = found.whatsappNum === "N/A" ? "" : found.whatsappNum;
    // Capture now: the updater runs later, after the ref below is overwritten
    const previous = syncedPhone.current;
    setPhoneDraft((draft) => (draft === previous ? phone : draft));
    syncedPhone.current = phone;
  }, [found]);

  const savedPhone = patient && patient.whatsappNum !== "N/A" ? patient.whatsappNum : "";
  const phoneDirty = phoneDraft.trim() !== savedPhone;

  const savePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNum: phoneDraft }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not save the number");
      const phone = result.data.whatsappNum === "N/A" ? "" : result.data.whatsappNum;
      setPatient(result.data);
      setPhoneDraft(phone);
      syncedPhone.current = phone;
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err: any) {
      setSaveError(err.message);
      setSaveState("idle");
    }
  };

  const steps = useMemo(() => {
    if (!patient) return [];
    const meta = getStateMeta(patient.state);
    const hasPhone = patient.whatsappNum !== "N/A";

    const sendStep: { status: StepStatus; detail?: string } =
      meta.key === "sent"
        ? { status: "done", detail: patient.sentAt }
        : meta.isIssue && meta.key !== "no_number"
          ? { status: "error", detail: meta.label }
          : meta.key === "pending"
            ? { status: "current", detail: "Ready, waiting for the sender" }
            : { status: "upcoming" };

    return [
      { title: "Print job received", detail: patient.reportCreationDate, status: "done" as StepStatus },
      {
        title: "WhatsApp number",
        detail: hasPhone
          ? `${patient.whatsappNum} · ${patient.phoneSource === "manual" ? "entered manually" : "from HL7"}`
          : "Missing, add it below",
        status: (hasPhone ? "done" : "error") as StepStatus,
      },
      { title: "Sent on WhatsApp", ...sendStep },
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
        <div className="grid items-start gap-6 lg:grid-cols-2">
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
              <form onSubmit={savePhone}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label htmlFor="whatsapp" className="flex items-center gap-2 font-semibold text-ink-900">
                    <MessageCircle className="h-4 w-4 text-teal-500" />
                    WhatsApp number
                  </label>
                  {savedPhone && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      {patient.phoneSource === "manual" ? "Entered manually" : "From HL7"}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    id="whatsapp"
                    type="tel"
                    inputMode="tel"
                    value={phoneDraft}
                    placeholder="e.g. 01001234567"
                    onChange={(e) => {
                      setPhoneDraft(e.target.value);
                      setSaveError(null);
                    }}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-ink-900 transition focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-400/20"
                  />
                  <button
                    type="submit"
                    disabled={!phoneDirty || saveState === "saving"}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-teal-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                  >
                    {saveState === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
                    {saveState === "saved" && <Check className="h-4 w-4" />}
                    {saveState === "saved" ? "Saved" : "Save"}
                  </button>
                </div>
                {saveError ? (
                  <p className="mt-2 text-xs text-rose-600">{saveError}</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    Saving puts the report back in the send queue. Numbers entered here take priority over HL7.
                  </p>
                )}
              </form>
            </Card>
          </div>

          <Card className="px-5 py-3">
            <h2 className="py-2 font-semibold text-ink-900">Study details</h2>
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Patient ID" value={patient.patientId} />
              <DetailRow label="Accession" value={patient.accessionNum} mono />
              <DetailRow label="Modality" value={patient.modality} />
              <DetailRow label="Study" value={patient.studyDesc} />
              <DetailRow label="Study date" value={patient.createdOn} />
              <DetailRow label="Received from ETIAM" value={patient.reportCreationDate} />
              <DetailRow label="Sent at" value={patient.sentAt} />
              <DetailRow label="Waiting time" value={patient.timer} mono />
            </dl>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
