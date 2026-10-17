"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ExternalLink, FileText, Loader2, Search, Send, X } from "lucide-react";
import { formatWhen } from "@/lib/format";
import { usePatient } from "@/lib/use-patients";
import { COUNTRIES } from "@/lib/phone";
import { getStateKey } from "@/lib/patient-states";
import { Avatar, StateBadge } from "@/components/ui";
import Drawer from "./Drawer";

type SendEntry = { at: string; trigger: "auto" | "manual"; phone: string; result: "done" | "failed" | "dry_run"; error: string | null };

type Props = {
  /** The case to show; null closes the drawer */
  id: number | null;
  /** Put the cursor in the phone field (the case needs a number) */
  focusPhone: boolean;
  onClose: () => void;
  onFind: (accession: string) => void;
  /** Called after something changed, so the Board refreshes its numbers */
  onChanged: () => void;
};

function Step({ done, title, time, pending = "Not yet", problem }: { done: boolean; title: string; time?: string; pending?: string; problem?: boolean }) {
  return (
    <li className="flex gap-3 pb-4 last:pb-0">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-500 text-white" : problem ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-400"}`}>
        <Check className="h-3.5 w-3.5" />
      </span>
      <div>
        <p className={`text-sm font-semibold ${done ? "text-ink-900" : problem ? "text-orange-700" : "text-slate-400"}`}>{title}</p>
        <p className={`text-xs tabular-nums ${problem ? "text-orange-600" : "text-slate-500"}`}>{done ? time : pending}</p>
      </div>
    </li>
  );
}

function Body({ id, focusPhone, onClose, onFind, onChanged }: Props & { id: number }) {
  const { patient: found, setPatient } = usePatient(String(id));
  const patient = found && found.id === id ? found : null;
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("20");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState<boolean | null>(null); // null: decide from the case
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sends, setSends] = useState<SendEntry[]>([]);
  const phoneRef = useRef<HTMLInputElement>(null);
  const synced = useRef("");

  // Keep what the user is typing unless the saved number changed underneath
  useEffect(() => {
    if (!patient) return;
    const key = `${patient.phoneNational}|${patient.countryCode}`;
    if (synced.current !== key) {
      synced.current = key;
      setPhone(patient.phoneNational);
      setCountry(patient.countryCode);
    }
  }, [patient]);

  useEffect(() => {
    if (focusPhone && patient) {
      const t = setTimeout(() => phoneRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [focusPhone, patient?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const historyKey = patient ? `${patient.state}|${patient.sentAtIso}|${patient.lastError}` : "";
  useEffect(() => {
    if (!patient) return;
    let cancelled = false;
    fetch(`/api/admin/patients/${patient.id}/sends`, { cache: "no-store" })
      .then((r) => r.json())
      .then((r) => !cancelled && Array.isArray(r.data) && setSends(r.data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [patient?.id, historyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!patient) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const state = getStateKey(patient.state);
  const hasNumber = !!patient.phoneNational;
  // Open by itself when the number needs attention (or the Board asked to fix it); otherwise one tap on the arrow
  const showForm = formOpen ?? (focusPhone || !patient.phoneValid || !hasNumber);
  const dirty = phone.trim() !== patient.phoneNational || country !== patient.countryCode;

  const savePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setPhoneError(null);
    try {
      const res = await fetch(`/api/admin/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNum: phone, countryCode: country }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not save the number");
      setPatient(result.data);
      onChanged();
    } catch (err: any) {
      setPhoneError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/patients/${patient.id}/send`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not send");
      setPatient(result.data);
      onChanged();
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={patient.patientName} size="md" />
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold leading-tight">{patient.patientName}</p>
            <p className="text-xs text-slate-500">
              {patient.patientId} · accession <span className="font-mono">{patient.accessionNum}</span>
            </p>
            <div className="mt-1.5">
              <StateBadge state={patient.state} />
            </div>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Journey</h3>
          <ol>
            <Step done title="Reached Nexta" time={formatWhen(patient.receivedAt)} />
            <Step done={!!patient.reportAt || patient.pdfs.length > 0} title="Report ready" time={formatWhen(patient.reportAt)} />
            <Step
              done={hasNumber && patient.phoneValid}
              problem={hasNumber && !patient.phoneValid}
              title="Phone number checked"
              time={`+${patient.countryCode} ${patient.phoneNational}`}
              pending={hasNumber ? "Not a valid number" : "No number yet"}
            />
            <Step done={!!patient.sentAtIso && state === "sent"} title="Sent to the patient" time={formatWhen(patient.sentAtIso)} />
          </ol>
        </section>

        <section>
          <button
            type="button"
            onClick={() => setFormOpen(!showForm)}
            aria-expanded={showForm}
            className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg text-left text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700"
          >
            <span className="flex items-center gap-1.5">
              <ChevronDown className={`h-4 w-4 transition-transform ${showForm ? "" : "-rotate-90"}`} />
              WhatsApp number
            </span>
            <span className="flex items-center gap-2">
              {!showForm && hasNumber && <span className="font-mono text-xs normal-case tracking-normal text-ink-900">+{patient.countryCode} {patient.phoneNational}</span>}
              {hasNumber && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-slate-500">
                  {patient.phoneSource === "manual" ? "Typed in" : "From the hospital system (HL7)"}
                </span>
              )}
            </span>
          </button>
          {showForm && <form onSubmit={savePhone} className="flex gap-2">
            <div className="relative shrink-0">
              <select
                aria-label="Country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="h-11 cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-8 text-sm font-medium text-ink-900 focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-400/20"
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
              ref={phoneRef}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneError(null);
              }}
              placeholder={country === "20" ? "e.g. 01001234567" : "Phone number"}
              className={`h-11 min-w-0 flex-1 rounded-xl border px-3.5 text-sm text-ink-900 focus:bg-white focus:outline-none focus:ring-4 ${
                state === "invalid_number" ? "border-orange-300 bg-orange-50/50 focus:border-orange-400 focus:ring-orange-400/20" : "border-slate-200 bg-slate-50 focus:border-teal-400 focus:ring-teal-400/20"
              }`}
            />
            <button
              type="submit"
              disabled={!dirty || saving}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-teal-500 px-4 text-sm font-semibold text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </form>}
          {showForm && (phoneError ? (
            <p className="mt-1.5 text-xs text-rose-600">{phoneError}</p>
          ) : state === "invalid_number" ? (
            <p className="mt-1.5 text-xs text-orange-600">This number doesn&apos;t work for WhatsApp. Correct it and save.</p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">Saving puts the report back in the send queue. A number typed here wins over HL7.</p>
          ))}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Send</h3>
          {patient.changedAfterSent && (
            <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">The report was updated after it was sent, so the patient still has the old version. Send it again to give them the new one.</p>
          )}
          {patient.lastError && state !== "sent" && (
            <p className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{patient.lastError}</p>
          )}
          <button
            type="button"
            onClick={sendNow}
            disabled={!!patient.sendBlockedReason || sending}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-500 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {sending || state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {state === "sending" ? "Sending…" : patient.sendLabel}
          </button>
          {patient.sendBlockedReason && state !== "sending" && <p className="mt-1.5 text-xs text-slate-500">{patient.sendBlockedReason}</p>}
          {sendError && <p className="mt-1.5 text-xs text-rose-600">{sendError}</p>}
          {sends.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-sm">
              {sends.slice(0, 5).map((s, i) => (
                <li key={`${s.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                  <span className={`font-medium ${s.result === "done" ? "text-emerald-700" : s.result === "failed" ? "text-rose-600" : "text-slate-600"}`}>
                    {s.result === "done" ? "Sent" : s.result === "failed" ? "Failed" : "Test mode"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatWhen(s.at)} · {s.trigger === "auto" ? "by itself" : "by a person"}
                  </span>
                  {s.error && <span className="basis-full text-xs text-rose-600">{s.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Report</h3>
          {patient.pdfs.length > 0 ? (
            <ul className="space-y-2">
              {patient.pdfs.map((f) => (
                <li key={f.url}>
                  <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-slate-200 hover:bg-slate-50">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.label}</span>
                    <ExternalLink className="h-4 w-4 text-slate-400" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              {patient.pdfBlockedReason ?? (
                <>
                  Still waiting for <b className="font-mono">{patient.pdfExpectedName ?? "the PDF"}</b>.
                </>
              )}{" "}
              <button type="button" onClick={() => onFind(patient.accessionNum)} className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
                <Search className="h-3.5 w-3.5" />
                Look for it
              </button>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Exam</h3>
          <dl className="divide-y divide-slate-100 text-sm">
            {[
              ["Study", patient.studyDesc],
              ["Exam type", patient.modality],
              ["Study date", patient.createdOn],
              ["Received from the imaging system", formatWhen(patient.receivedAt)],
              ["Report pulled into Nexta", patient.reportAt ? formatWhen(patient.reportAt) : "Not yet"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <footer className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        <Link href={`/patient/${patient.id}`} className="font-semibold text-brand-600 hover:underline">
          Open the full page
        </Link>{" "}
        · a link you can share with a colleague
      </footer>
    </>
  );
}

export default function PatientDrawer(props: Props) {
  return (
    <Drawer open={props.id !== null} onClose={props.onClose}>
      {props.id !== null && <Body key={props.id} {...props} id={props.id} />}
    </Drawer>
  );
}
