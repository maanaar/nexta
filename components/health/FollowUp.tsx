"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Loader2, Plus, Send, X } from "lucide-react";
import { formatWhen } from "@/lib/format";
import { useJson } from "@/lib/use-json";

type Contact = { id: number; name: string; phone: string; dayOfWeek: number; lastSentAt: string | null; lastResult: "done" | "failed" | "dry_run" | null; lastError: string | null };
type Data = {
  contacts: Contact[];
  today: { date: string; dayOfWeek: number };
  reportDay: string;
  settings: { siteName: string; auto: boolean; time: string; templateSet: boolean; whatsappSet: boolean; testMode: boolean; browserFound: boolean };
};
type Line = { key: string; id: number | null; name: string; phone: string; dayOfWeek: number };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

let counter = 0;
const newKey = () => `new-${++counter}`;
const toLines = (contacts: Contact[]): Line[] => contacts.map((c) => ({ key: String(c.id), id: c.id, name: c.name, phone: c.phone, dayOfWeek: c.dayOfWeek }));
const snapshot = (lines: Line[]) => JSON.stringify(lines.filter((l) => l.name.trim() || l.phone.trim()).map((l) => [l.id, l.name.trim(), l.phone.trim(), l.dayOfWeek]));

/** "09:00" → "9:00 AM" */
function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const inputClass = "h-9 w-full rounded-lg border border-transparent bg-transparent px-2 text-sm hover:border-slate-200 focus:border-brand-400 focus:bg-white focus:outline-none";

/** The follow-up schedule: who gets the report on WhatsApp on which day, with the buttons to preview and send it. */
export default function FollowUp() {
  const { data, reload } = useJson<Data>("/api/admin/follow-up");
  const [lines, setLines] = useState<Line[]>([]);
  const [saved, setSaved] = useState("[]");
  const [busy, setBusy] = useState<"save" | "send" | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Take the server's list when it first arrives and after each save; keep what is being typed otherwise
  useEffect(() => {
    if (!data) return;
    const fromServer = toLines(data.contacts);
    if (snapshot(lines) === saved || lines.length === 0) {
      setLines(fromServer);
      setSaved(snapshot(fromServer));
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => snapshot(lines) !== saved, [lines, saved]);
  const today = data?.today.dayOfWeek ?? new Date().getDay();
  const dueToday = lines.filter((l) => l.dayOfWeek === today && l.id && l.name.trim()).length;

  const change = (key: string, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setNote(null);
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/admin/follow-up", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: lines.map((l) => ({ id: l.id, name: l.name, phone: l.phone, dayOfWeek: l.dayOfWeek })) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not save");
      const fresh = toLines(body.data.contacts);
      setLines(fresh);
      setSaved(snapshot(fresh));
      setNote("Saved");
      reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const sendNow = async (contactId?: number) => {
    const who = contactId ? lines.find((l) => l.id === contactId)?.name || "this person" : `${dueToday} ${dueToday === 1 ? "person" : "people"} scheduled for today`;
    if (!window.confirm(`Send the follow-up report on WhatsApp now to ${who}?`)) return;
    setBusy(contactId ?? "send");
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/follow-up/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not send");
      const results = body.data as { name: string; ok: boolean; error?: string }[];
      const failed = results.filter((r) => !r.ok);
      if (results.length === 0) setNote("Nobody is waiting for today's report.");
      else if (failed.length) setError(failed.map((f) => `${f.name || "Send"}: ${f.error}`).join(" · "));
      else setNote(`Sent to ${results.length} ${results.length === 1 ? "person" : "people"}.`);
      reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const s = data?.settings;
  const problems = s
    ? [
        !s.whatsappSet && "WhatsApp isn't set up (Server settings)",
        !s.templateSet && "the WhatsApp template name is missing (Server settings)",
        !s.browserFound && "no Chrome or Edge was found to make the report PDF (Server settings)",
      ].filter(Boolean)
    : [];

  return (
    <section className="rounded-2xl bg-white p-5 shadow-lg shadow-ink-900/10 ring-1 ring-slate-200/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Follow-up schedule</h2>
          <p className="text-xs text-slate-500">
            {s ? (
              <>
                Each person gets the site&apos;s report on WhatsApp on their day{s.auto ? <> at <b>{clock(s.time)}</b></> : null}, for <b>{s.siteName || "your site"}</b>. The main part is the
                day 7 days back; yesterday is a short preview.{" "}
                {!s.auto && <b className="text-amber-700">Automatic sending is off (Server settings).</b>} {s.testMode && s.auto && <b className="text-amber-700">Test mode: nothing is really sent.</b>}
              </>
            ) : (
              "Loading…"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/admin/follow-up/preview"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <Eye className="h-4 w-4" />
            Preview the report
          </a>
          <button
            type="button"
            onClick={() => sendNow()}
            disabled={busy !== null || dirty || dueToday === 0}
            title={dirty ? "Save your changes first" : dueToday === 0 ? "Nobody is scheduled for today" : undefined}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-500 px-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send today&apos;s report now
          </button>
        </div>
      </div>

      {problems.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Nothing can be sent yet: {problems.join("; ")}.</span>
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">WhatsApp number</th>
              <th className="px-3 py-2.5">Day of the week</th>
              <th className="px-3 py-2.5">Last sent</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">
                  Nobody on the schedule yet. Add a line.
                </td>
              </tr>
            )}
            {lines.map((l) => {
              const row = data?.contacts.find((c) => c.id === l.id);
              return (
                <tr key={l.key} className="hover:bg-slate-50/70">
                  <td className="px-3 py-1.5">
                    <input className={inputClass} value={l.name} onChange={(e) => change(l.key, { name: e.target.value })} placeholder="Name" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input className={`${inputClass} font-mono`} value={l.phone} onChange={(e) => change(l.key, { phone: e.target.value })} placeholder="+20 100 123 4567" inputMode="tel" />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <select className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm" value={l.dayOfWeek} onChange={(e) => change(l.key, { dayOfWeek: Number(e.target.value) })}>
                        {DAYS.map((d, i) => (
                          <option key={d} value={i}>
                            {d}
                          </option>
                        ))}
                      </select>
                      {l.dayOfWeek === today && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">today</span>}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-slate-500">
                    {row?.lastSentAt ? (
                      <span title={row.lastError ?? undefined}>
                        {formatWhen(row.lastSentAt)}{" "}
                        <b className={row.lastResult === "done" ? "text-emerald-700" : row.lastResult === "failed" ? "text-rose-600" : "text-slate-500"}>
                          {row.lastResult === "done" ? "· sent" : row.lastResult === "failed" ? "· failed" : "· test"}
                        </b>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      {l.id && (
                        <button
                          type="button"
                          title="Send the report to this person now"
                          disabled={busy !== null || dirty}
                          onClick={() => sendNow(l.id!)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-teal-50 hover:text-teal-600 disabled:opacity-40"
                        >
                          {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                      )}
                      <button type="button" title="Remove this line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, { key: newKey(), id: null, name: "", phone: "", dayOfWeek: today }])}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-600 ring-1 ring-brand-200 hover:bg-brand-50"
        >
          <Plus className="h-4 w-4" />
          Add a line
        </button>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={busy !== null}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </button>
        )}
        {note && !dirty && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {note}
          </span>
        )}
        {error && <span className="text-sm text-rose-600">{error}</span>}
      </div>
      <p className="mt-2 text-xs text-slate-500">Numbers are checked like patient numbers: start with the country code (+20 …), or just type an Egyptian number.</p>
    </section>
  );
}
