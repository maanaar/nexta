"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  FileText,
  Hash,
  IdCard,
  Loader2,
  MessageCircle,
  Send,
  Stethoscope,
  X,
} from "lucide-react";
import PatientPdfViewer from "./PatientPdfViewer";
import type { PatientRecord } from "@/lib/patient-data";
import { getStateMeta } from "@/lib/patient-states";
import { COUNTRIES } from "@/lib/phone";
import { usePatient } from "@/lib/use-patients";
import { Avatar, Card, ErrorBanner, PageBody, PageHero, StateBadge } from "@/components/ui";

type StepStatus = "done" | "current" | "error" | "upcoming";

type SendEntry = {
  at: string;
  trigger: "auto" | "manual";
  phone: string;
  result: "done" | "failed" | "dry_run";
  error: string | null;
};

const RESULT_LABEL: Record<SendEntry["result"], string> = {
  done: "Sent",
  failed: "Failed",
  dry_run: "Test mode (not sent)",
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const { patient: found, isLoading, error } = usePatient(patientId);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [countryDraft, setCountryDraft] = useState("20");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sends, setSends] = useState<SendEntry[]>([]);

  // Last number and country received from the server, so live updates don't overwrite what the user is typing
  const syncedPhone = useRef("");
  const syncedCountry = useRef("20");

  useEffect(() => {
    if (!found) return;
    setPatient(found);
    const phone = found.phoneNational;
    // Capture now: the updaters run later, after the refs below are overwritten
    const previousPhone = syncedPhone.current;
    const previousCountry = syncedCountry.current;
    setPhoneDraft((draft) => (draft === previousPhone ? phone : draft));
    setCountryDraft((draft) => (draft === previousCountry ? found.countryCode : draft));
    syncedPhone.current = phone;
    syncedCountry.current = found.countryCode;
  }, [found]);

  // The send history, reloaded whenever a send starts or ends
  const historyKey = patient ? `${patient.id}|${patient.state}|${patient.sentAt}|${patient.lastError}` : "";
  useEffect(() => {
    if (!patient) return;
    let cancelled = false;
    fetch(`/api/admin/patients/${patient.id}/sends`, { cache: "no-store" })
      .then((r) => r.json())
      .then((r) => {
        if (!cancelled && Array.isArray(r.data)) setSends(r.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey]);

  const savedPhone = patient?.phoneNational ?? "";
  const phoneDirty = phoneDraft.trim() !== savedPhone || (patient ? countryDraft !== patient.countryCode : false);

  const savePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNum: phoneDraft, countryCode: countryDraft }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not save the number");
      setPatient(result.data);
      setPhoneDraft(result.data.phoneNational);
      setCountryDraft(result.data.countryCode);
      syncedPhone.current = result.data.phoneNational;
      syncedCountry.current = result.data.countryCode;
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err: any) {
      setSaveError(err.message);
      setSaveState("idle");
    }
  };

  const sendNow = async () => {
    if (!patient) return;
    setSendBusy(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/patients/${patient.id}/send`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not send");
      // The upload carries on in the background; the live update shows Sent or Failed
      setPatient(result.data);
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setSendBusy(false);
    }
  };

  const steps = useMemo(() => {
    if (!patient) return [];
    const meta = getStateMeta(patient.state);
    const hasPhone = patient.phoneValid;
    const hasPdf = patient.pdfs.length > 0;

    const sendStep: { status: StepStatus; detail?: string } = patient.changedAfterSent
      ? { status: "current", detail: "The report changed after it was sent. Ready to send again" }
      : meta.key === "sent"
        ? { status: "done", detail: patient.sentAt }
        : meta.isIssue && meta.key !== "no_number"
          ? { status: "error", detail: patient.lastError ?? meta.label }
          : meta.key === "pending"
            ? { status: "current", detail: patient.sendBlockedReason ?? "Ready to send" }
            : { status: "upcoming" };

    return [
      { title: "Print job received", detail: patient.reportCreationDate, status: "done" as StepStatus },
      {
        title: "Report PDF",
        detail: hasPdf
          ? patient.pdfs.filter((p) => !p.url.endsWith("n=all")).map((p) => p.label).join(", ")
          : patient.pdfBlockedReason
            ? "Can't be matched automatically"
            : `Waiting for ${patient.pdfExpectedName ?? "the PDF"}`,
        status: (hasPdf ? "done" : patient.pdfBlockedReason ? "error" : "current") as StepStatus,
      },
      {
        title: "WhatsApp number",
        detail: hasPhone
          ? `${patient.whatsappNum} · ${patient.phoneSource === "manual" ? "entered manually" : "from HL7"}`
          : patient.whatsappNum !== "N/A"
            ? `${patient.whatsappNum} isn't a valid number. Correct it below`
            : "Missing, add it below",
        // Only a problem once the PDF is there and nothing else is holding it up
        status: (hasPhone ? "done" : hasPdf ? "error" : "upcoming") as StepStatus,
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
                  <div className="relative shrink-0">
                    <select
                      aria-label="Country"
                      value={countryDraft}
                      onChange={(e) => {
                        setCountryDraft(e.target.value);
                        setSaveError(null);
                      }}
                      className="h-11 cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-8 text-sm font-medium text-ink-900 transition focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-400/20"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          +{c.code} {c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                  <input
                    id="whatsapp"
                    type="tel"
                    inputMode="tel"
                    value={phoneDraft}
                    placeholder={countryDraft === "20" ? "e.g. 01001234567" : "Phone number"}
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

            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold text-ink-900">
                <Send className="h-4 w-4 text-teal-500" />
                Send on WhatsApp
              </h2>
              {patient.changedAfterSent && (
                <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  The report changed after it was sent. Send it again to give the patient the new version.
                </p>
              )}
              {patient.lastError && patient.state !== "done" && (
                <p className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {patient.lastError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={sendNow}
                  disabled={!!patient.sendBlockedReason || sendBusy}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  {sendBusy || patient.state === "sending" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {patient.state === "sending" ? "Sending…" : patient.sendLabel}
                </button>
                {patient.sendBlockedReason && patient.state !== "sending" && (
                  <span className="text-xs text-slate-500">{patient.sendBlockedReason}</span>
                )}
              </div>
              {sendError && <p className="mt-2 text-xs text-rose-600">{sendError}</p>}

              {sends.length > 0 && (
                <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
                  {sends.map((s, i) => (
                    <li key={`${s.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
                      <span
                        className={`font-medium ${
                          s.result === "done" ? "text-emerald-700" : s.result === "failed" ? "text-rose-600" : "text-slate-600"
                        }`}
                      >
                        {RESULT_LABEL[s.result]}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatWhen(s.at)} · +{s.phone} · {s.trigger === "auto" ? "automatic" : "manual"}
                      </span>
                      {s.error && <span className="basis-full text-xs text-rose-600">{s.error}</span>}
                    </li>
                  ))}
                </ul>
              )}
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

        <Card className="mt-6 p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-ink-900">
            <FileText className="h-4 w-4 text-brand-500" />
            Report
          </h2>
          {patient.pdfs.length > 0 ? (
            <PatientPdfViewer pdfs={patient.pdfs} />
          ) : patient.pdfBlockedReason ? (
            <p className="mx-auto my-8 max-w-xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
              {patient.pdfBlockedReason}
            </p>
          ) : (
            <p className="py-12 text-center text-sm text-slate-500">
              Still waiting for{" "}
              <span className="font-mono font-medium text-ink-900">{patient.pdfExpectedName ?? "the PDF"}</span>. This
              page updates by itself when it arrives.
            </p>
          )}
        </Card>
      </PageBody>
    </>
  );
}
