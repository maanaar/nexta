"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Database,
  FileText,
  FileArchive,
  FlaskConical,
  FolderInput,
  Loader2,
  MessageCircle,
  MessageSquareText,
  RotateCcw,
  Save,
  Send,
  XCircle,
} from "lucide-react";
import { Card, ErrorBanner, PageBody, PageHero } from "@/components/ui";

type Key =
  | "etiamDbPath"
  | "pdfInDir"
  | "gsPath"
  | "compressMinMb"
  | "pdfMatch"
  | "pdfDir"
  | "hl7Dir"
  | "pdfName"
  | "sendFromDate"
  | "compressFromDate"
  | "sendDelaySeconds"
  | "waPhoneNumberId"
  | "waToken"
  | "waTemplate"
  | "waLang"
  | "siteName"
  | "followUpTime"
  | "browserPath"
  | "waFollowTemplate";
type FlagKey = "debug" | "autoSend" | "waDryRun" | "followUpAuto";
type AnyKey = Key | FlagKey;
type Source = "saved" | "env" | "default";
type Check = { ok: boolean; message: string };

const FLAG_KEYS: FlagKey[] = ["debug", "autoSend", "waDryRun", "followUpAuto"];

type Settings = {
  values: {
    etiamDbPath: string;
    pdfInDir: string;
    gsPath: string;
    compressMinMb: number;
    pdfMatch: "contains" | "exact";
    pdfDir: string;
    hl7Dir: string;
    pdfName: string;
    debug: boolean;
    autoSend: boolean;
    sendFromDate: string;
    compressFromDate: string;
    sendDelaySeconds: number;
    waPhoneNumberId: string;
    /** The token itself is never sent to the browser; this only says one is saved */
    waTokenSet: boolean;
    waTemplate: string;
    waLang: string;
    waDryRun: boolean;
    siteName: string;
    followUpAuto: boolean;
    followUpTime: string;
    browserPath: string;
    waFollowTemplate: string;
  };
  sources: Record<AnyKey, Source>;
  defaults: Record<AnyKey, string>;
  fallbacks: Record<AnyKey, string>;
  presets: { value: string; label: string; example: string }[];
  fields: string[];
  sync: { lastSync: string | null; etiamError: string | null; hl7Error: string | null } | null;
};

type Form = {
  etiamDbPath: string;
  pdfInDir: string;
  useCompression: boolean;
  gsPath: string;
  compressMinMb: string;
  pdfMatch: "contains" | "exact";
  pdfDir: string;
  hl7Dir: string;
  pdfName: string;
  debug: boolean;
  usePdfDir: boolean;
  autoSend: boolean;
  sendFromDate: string;
  compressFromDate: string;
  sendDelaySeconds: string;
  waPhoneNumberId: string;
  /** Only what is typed now; blank keeps the saved token */
  waToken: string;
  waTemplate: string;
  waLang: string;
  waDryRun: boolean;
  siteName: string;
  followUpAuto: boolean;
  followUpTime: string;
  browserPath: string;
  waFollowTemplate: string;
};

// Dropdown value for "Custom pattern…" (never a real pattern: it has no {field})
const CUSTOM = "__custom__";

const SOURCE_LABEL: Record<Source, string> = {
  saved: "Saved here",
  env: "From .env",
  default: "Built-in default",
};

function toForm(s: Settings): Form {
  const { waTokenSet: _waTokenSet, sendDelaySeconds, compressMinMb, ...rest } = s.values;
  return {
    ...rest,
    sendDelaySeconds: String(sendDelaySeconds),
    compressMinMb: String(compressMinMb),
    waToken: "",
    usePdfDir: s.values.pdfDir !== "",
    useCompression: s.values.pdfInDir !== "",
  };
}

function SourceBadge({ source }: { source: Source }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        source === "saved" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

function CheckLine({ check }: { check?: Check }) {
  if (!check) return null;
  return (
    <p className={`mt-2 flex items-start gap-1.5 text-sm ${check.ok ? "text-emerald-700" : "text-rose-600"}`}>
      {check.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      {check.message}
    </p>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  source,
  onReset,
  children,
}: {
  icon: typeof Database;
  title: string;
  description: React.ReactNode;
  source?: Source;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-ink-900">{title}</h2>
            <p className="text-sm text-slate-500">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {source && <SourceBadge source={source} />}
          {source === "saved" && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-ink-900"
              title="Stop using the value saved here; use .env or the built-in default"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>
      {children}
    </Card>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 font-mono text-sm text-ink-900 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:opacity-50";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [checks, setChecks] = useState<
    Partial<Record<"etiamDbPath" | "pdfDir" | "hl7Dir" | "pdfName" | "compression" | "whatsapp", Check>>
  >({});
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Fields to stop saving here (back to .env / default) on the next save
  const [resets, setResets] = useState<Set<AnyKey>>(new Set());

  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Settings & { error?: string }) => {
        if (s.error) throw new Error(s.error);
        setSettings(s);
        setForm(toForm(s));
      })
      .catch((err) => setError(err.message));
  }, []);

  const customName = useMemo(
    () => !!form && !!settings && !settings.presets.some((p) => p.value === form.pdfName),
    [form, settings]
  );

  // Anything changed since the page was loaded or last saved (a typed token, or a field set back to its default, counts)
  const isDirty = useMemo(() => {
    if (!settings || !form) return false;
    return resets.size > 0 || JSON.stringify(form) !== JSON.stringify(toForm(settings));
  }, [settings, form, resets]);

  if (!settings || !form) {
    return (
      <>
        <PageHero title="Server settings" />
        <PageBody>
          {error ? (
            <ErrorBanner message={error} />
          ) : (
            <Card className="p-10">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
            </Card>
          )}
        </PageBody>
      </>
    );
  }

  const update = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setSaved(false);
    setResets((r) => {
      const next = new Set(r);
      for (const k of Object.keys(patch)) {
        next.delete(k === "usePdfDir" ? "pdfDir" : k === "useCompression" ? "pdfInDir" : (k as AnyKey));
      }
      return next;
    });
  };

  const reset = (key: AnyKey) => {
    const fallback = settings.fallbacks[key];
    if (FLAG_KEYS.includes(key as FlagKey)) update({ [key]: fallback === "1" || fallback === "true" } as Partial<Form>);
    else if (key === "pdfDir") update({ pdfDir: fallback, usePdfDir: fallback !== "" });
    else if (key === "pdfInDir") update({ pdfInDir: fallback, useCompression: fallback !== "" });
    else update({ [key]: fallback } as Partial<Form>);
    setResets((r) => new Set(r).add(key));
  };

  const formValues = () => ({
    etiamDbPath: form.etiamDbPath,
    pdfInDir: form.useCompression ? form.pdfInDir : "",
    gsPath: form.gsPath,
    pdfDir: form.usePdfDir ? form.pdfDir : "",
    hl7Dir: form.hl7Dir,
    pdfName: form.pdfName,
    pdfMatch: form.pdfMatch,
    waPhoneNumberId: form.waPhoneNumberId,
    waTemplate: form.waTemplate,
    waToken: form.waToken,
  });

  const runTest = async () => {
    setBusy("test");
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValues()),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Test failed");
      setChecks(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      const delay = form.sendDelaySeconds.trim();
      const minMb = form.compressMinMb.trim();
      const body: Record<string, string | number | boolean | null> = {
        ...formValues(),
        debug: form.debug,
        autoSend: form.autoSend,
        waDryRun: form.waDryRun,
        waLang: form.waLang,
        sendFromDate: form.sendFromDate,
        compressFromDate: form.compressFromDate,
        siteName: form.siteName,
        followUpAuto: form.followUpAuto,
        followUpTime: form.followUpTime,
        browserPath: form.browserPath,
        waFollowTemplate: form.waFollowTemplate,
        sendDelaySeconds: delay === "" ? null : Number(delay),
        compressMinMb: minMb === "" ? null : Number(minMb),
      };
      for (const key of resets) body[key] = null;
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not save");
      setSettings(result);
      setForm(toForm(result));
      setResets(new Set());
      setSaved(true);
      await runTest();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  // Label for a field inside a section that holds several settings: where its value comes from, and a way back to it
  const fieldLabel = (key: Key, text: string) => (
    <div className="mb-1.5 mt-4 flex items-center justify-between gap-2 first:mt-0">
      <span className="text-sm font-semibold text-ink-900">{text}</span>
      <span className="flex items-center gap-2">
        {!resets.has(key) && <SourceBadge source={settings.sources[key]} />}
        {!resets.has(key) && settings.sources[key] === "saved" && (
          <button
            type="button"
            onClick={() => reset(key)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-ink-900"
            title="Stop using the value saved here; use .env or the built-in default"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </span>
    </div>
  );

  const tokenSaved = settings.values.waTokenSet && !resets.has("waToken");
  const sync = settings.sync;

  return (
    <>
      <PageHero
        title="Server settings"
        subtitle="Set up where Nexta finds ETIAM, the PDFs and the HL7 messages on this server. Changes apply right away, no restart needed."
      />

      <PageBody>
        {error && <ErrorBanner message={error} />}

        {sync && (
          <div
            className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
              sync.etiamError
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {sync.etiamError ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              {sync.etiamError
                ? `Nexta can't read the ETIAM database right now: ${sync.etiamError}`
                : `Connected to ETIAM. Last sync ${sync.lastSync ? new Date(sync.lastSync).toLocaleTimeString() : "—"}.`}
              {sync.hl7Error && <span className="block text-xs opacity-80">HL7: {sync.hl7Error}</span>}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-6">
          <Section
            icon={Database}
            title="ETIAM database"
            description="ETIAM DcmPRI's print database. Nexta only reads it, never writes."
            source={resets.has("etiamDbPath") ? undefined : settings.sources.etiamDbPath}
            onReset={() => reset("etiamDbPath")}
          >
            <input
              className={inputClass}
              value={form.etiamDbPath}
              onChange={(e) => update({ etiamDbPath: e.target.value })}
              placeholder={settings.defaults.etiamDbPath}
              spellCheck={false}
            />
            <CheckLine check={checks.etiamDbPath} />
          </Section>

          <Section
            icon={FileArchive}
            title="PDF compression (optional)"
            description="Nexta compresses each PDF it finds in this folder with Ghostscript and saves it, under the same name, in the PDF folder below. The originals stay here."
            source={resets.has("pdfInDir") ? undefined : settings.sources.pdfInDir}
            onReset={() => reset("pdfInDir")}
          >
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.useCompression}
                onChange={(e) => update({ useCompression: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
              />
              Compress PDFs before they are used (otherwise PDFs are taken straight from the PDF folder)
            </label>
            <input
              className={inputClass}
              value={form.useCompression ? form.pdfInDir : ""}
              disabled={!form.useCompression}
              onChange={(e) => update({ pdfInDir: e.target.value })}
              placeholder="Folder the PDFs are first saved to, e.g. E:\pdf_in"
              spellCheck={false}
            />

            {form.useCompression && (
              <>
                {fieldLabel("compressMinMb", "Compress files larger than (MB)")}
                <input
                  type="number"
                  min={0}
                  step="any"
                  className={`${inputClass} max-w-xs`}
                  value={form.compressMinMb}
                  onChange={(e) => update({ compressMinMb: e.target.value })}
                  placeholder={settings.defaults.compressMinMb}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Smaller files are copied as they are. 0 compresses every file.
                </p>

                {fieldLabel("compressFromDate", "Prepare reports from this date")}
                <input
                  type="date"
                  className={`${inputClass} max-w-xs`}
                  value={form.compressFromDate}
                  onChange={(e) => update({ compressFromDate: e.target.value })}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Files saved before this day are left alone, so a big backlog of old reports isn&apos;t prepared. Newer files
                  go first, and a file that arrives from now on is always prepared. Leave empty to prepare everything.
                </p>

                {fieldLabel("gsPath", "Ghostscript path (optional)")}
                <input
                  className={inputClass}
                  value={form.gsPath}
                  onChange={(e) => update({ gsPath: e.target.value })}
                  placeholder="Found automatically, or e.g. C:\Program Files\gs\gs10.07.1\bin\gswin64c.exe"
                  spellCheck={false}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  If compression can&apos;t be done (Ghostscript missing, an error, no size gain), the original PDF is
                  passed on as it is, so reports are never held up.
                </p>
              </>
            )}
            <CheckLine check={checks.compression} />
          </Section>

          <Section
            icon={FileText}
            title="PDF reports"
            description={
              form.useCompression
                ? "Where the compressed PDFs are saved and picked up from, and what each PDF file is named by."
                : "Where the PDFs land, and what each PDF file is named by."
            }
            source={resets.has("pdfDir") ? undefined : settings.sources.pdfDir}
            onReset={() => reset("pdfDir")}
          >
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.usePdfDir}
                onChange={(e) =>
                  update({ usePdfDir: e.target.checked, pdfDir: form.pdfDir || settings.defaults.pdfDir })
                }
                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
              />
              {form.useCompression
                ? "PDF folder after compression"
                : "Look for PDFs in a folder (otherwise only PDFs stored inside ETIAM are used)"}
            </label>
            <input
              className={inputClass}
              value={form.usePdfDir ? form.pdfDir : ""}
              disabled={!form.usePdfDir}
              onChange={(e) => update({ pdfDir: e.target.value })}
              placeholder={settings.defaults.pdfDir}
              spellCheck={false}
            />
            <CheckLine check={checks.pdfDir} />

            <div className="mt-5 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink-900">Find each job&apos;s PDF by</h3>
              {!resets.has("pdfName") && <SourceBadge source={settings.sources.pdfName} />}
            </div>
            <div className="relative mt-2 max-w-md">
              <select
                aria-label="Find each job's PDF by"
                value={customName ? CUSTOM : form.pdfName}
                onChange={(e) =>
                  update({
                    // Switching to Custom starts from a safe example; keep a custom pattern already typed
                    pdfName: e.target.value === CUSTOM ? (customName ? form.pdfName : "{name}_{accession}") : e.target.value,
                  })
                }
                className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-10 text-sm font-medium text-ink-900 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15"
              >
                {settings.presets.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
                <option value={CUSTOM}>Custom pattern…</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            {!customName && (
              <p className="mt-1.5 text-xs text-slate-500">
                Looks for files like{" "}
                <code className="rounded bg-slate-100 px-1 font-mono">
                  {settings.presets.find((p) => p.value === form.pdfName)?.example}
                </code>
              </p>
            )}

            {customName && (
              <div className="mt-3">
                <input
                  className={inputClass}
                  value={form.pdfName}
                  onChange={(e) => update({ pdfName: e.target.value })}
                  spellCheck={false}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Fields: {settings.fields.map((f) => <code key={f} className="mr-1.5 rounded bg-slate-100 px-1">{f}</code>)}
                  <code className="rounded bg-slate-100 px-1">{"{jobuid}"}</code> uses dashes instead of dots, like
                  PDFCreator.
                </p>
              </div>
            )}

            {form.pdfName === "{accession}" && (
              <>
                {fieldLabel("pdfMatch", "The file name must")}
                <div className="relative max-w-md">
                  <select
                    aria-label="How the file name is matched"
                    value={form.pdfMatch}
                    onChange={(e) => update({ pdfMatch: e.target.value as Form["pdfMatch"] })}
                    className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-10 text-sm font-medium text-ink-900 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15"
                  >
                    <option value="contains">Contain the number (recommended)</option>
                    <option value="exact">Be exactly the number</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </>
            )}
            {(form.pdfName === "{patientid}" || (form.pdfName === "{accession}" && form.pdfMatch === "contains")) && (
              <p className="mt-1.5 text-xs text-slate-500">
                Finds <code className="rounded bg-slate-100 px-1 font-mono">330930.pdf</code>,{" "}
                <code className="rounded bg-slate-100 px-1 font-mono">112344_330930.pdf</code> and{" "}
                <code className="rounded bg-slate-100 px-1 font-mono">4544_330930_45456.pdf</code>. The number has to
                stand on its own in the name (not inside 1330930), letters and dashes are fine, and numbers shorter than
                4 characters aren&apos;t matched. A name that holds the numbers of several patients is never matched.
              </p>
            )}
            {form.pdfName === "{patientid}" && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                A patient can have several exams. A file with only the patient ID goes to an exam only when it is the
                only one of that patient still waiting for a PDF; otherwise it is held and the patient page says why.
                Finding PDFs by accession number avoids this.
              </p>
            )}

            {form.pdfName.includes("{name}") && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Patient names aren&apos;t unique. If two patients share a name, Nexta won&apos;t match that file to either
                of them, to avoid sending a report to the wrong person. Adding the accession (e.g.{" "}
                <code>{"{name}_{accession}"}</code>) avoids this.
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {form.pdfName === "{patientid}" || (form.pdfName === "{accession}" && form.pdfMatch === "contains") ? (
                <>Several files for the same report are merged into one PDF, oldest first.</>
              ) : (
                <>
                  Later prints of the same job are picked up as <code>_2</code>, <code>_3</code>… and merged into one
                  PDF.
                </>
              )}
            </p>
            <CheckLine check={checks.pdfName} />
          </Section>

          <Section
            icon={MessageSquareText}
            title="HL7 messages"
            description="Folder with incoming HL7 messages; patients' phone numbers are read from them."
            source={resets.has("hl7Dir") ? undefined : settings.sources.hl7Dir}
            onReset={() => reset("hl7Dir")}
          >
            <input
              className={inputClass}
              value={form.hl7Dir}
              onChange={(e) => update({ hl7Dir: e.target.value })}
              placeholder={settings.defaults.hl7Dir}
              spellCheck={false}
            />
            <CheckLine check={checks.hl7Dir} />
          </Section>

          <Section
            icon={MessageCircle}
            title="WhatsApp"
            description="The WhatsApp Business account reports are sent from, and the approved template that carries the PDF."
          >
            {fieldLabel("waPhoneNumberId", "Phone number ID")}
            <input
              className={inputClass}
              value={form.waPhoneNumberId}
              onChange={(e) => update({ waPhoneNumberId: e.target.value })}
              placeholder="e.g. 123456789012345"
              spellCheck={false}
            />

            {fieldLabel("waToken", "Access token")}
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={form.waToken}
              onChange={(e) => update({ waToken: e.target.value })}
              placeholder={tokenSaved ? "Saved. Leave blank to keep it" : "Paste the access token"}
              spellCheck={false}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              The token is stored on this server and never shown again. To change it, paste a new one.
            </p>

            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <div>
                {fieldLabel("waTemplate", "Template name")}
                <input
                  className={inputClass}
                  value={form.waTemplate}
                  onChange={(e) => update({ waTemplate: e.target.value })}
                  placeholder="e.g. medical_report"
                  spellCheck={false}
                />
              </div>
              <div>
                {fieldLabel("waLang", "Language")}
                <input
                  className={inputClass}
                  value={form.waLang}
                  onChange={(e) => update({ waLang: e.target.value })}
                  placeholder="ar"
                  spellCheck={false}
                />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              The template must have the PDF as its document header. Press Test to check the phone number ID and token
              with Meta; nothing is sent.
            </p>
            <CheckLine check={checks.whatsapp} />
          </Section>

          <Section
            icon={Send}
            title="Sending"
            description="When reports go out over WhatsApp on their own. The Send button on each report always works."
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.autoSend}
                onChange={(e) => update({ autoSend: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
              />
              Send reports automatically
              {!resets.has("autoSend") && <SourceBadge source={settings.sources.autoSend} />}
            </label>
            <p className="mt-1.5 text-xs text-slate-500">
              A report is sent once it has its PDF and a valid number. If its PDF changes after it was sent, it is sent
              again. With this off, nothing is sent until someone presses Send.
            </p>

            {fieldLabel("sendFromDate", "Start sending from")}
            <input
              type="date"
              className={`${inputClass} max-w-xs`}
              value={form.sendFromDate}
              onChange={(e) => update({ sendFromDate: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Reports whose study date is before this day are never sent over WhatsApp, so older history can&apos;t go out
              by accident. Required to turn on automatic sending.
            </p>

            {fieldLabel("sendDelaySeconds", "Wait before sending (seconds)")}
            <input
              type="number"
              min={0}
              max={3600}
              step={1}
              className={`${inputClass} max-w-xs`}
              value={form.sendDelaySeconds}
              onChange={(e) => update({ sendDelaySeconds: e.target.value })}
              placeholder={settings.defaults.sendDelaySeconds}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Counted from the report&apos;s last change (a new PDF or number), so a quick correction or a follow-up
              print is included. 0 sends immediately.
            </p>

            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.waDryRun}
                onChange={(e) => update({ waDryRun: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
              />
              Test mode: automatic sending only logs what it would send. The Send button still sends for real
              {!resets.has("waDryRun") && <SourceBadge source={settings.sources.waDryRun} />}
            </label>
          </Section>

          <Section
            icon={MessageSquareText}
            title="Follow-up report"
            description="A report of the site's numbers, sent on WhatsApp to the people on the follow-up schedule (System health), on their day of the week."
          >
            {fieldLabel("siteName", "Site name")}
            <input
              className={inputClass}
              value={form.siteName}
              onChange={(e) => update({ siteName: e.target.value })}
              placeholder="e.g. Al-Noor Imaging Center"
            />
            <p className="mt-1.5 text-xs text-slate-500">Shown at the top of the report.</p>

            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.followUpAuto}
                onChange={(e) => update({ followUpAuto: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
              />
              Send the follow-up report automatically
              {!resets.has("followUpAuto") && <SourceBadge source={settings.sources.followUpAuto} />}
            </label>
            <p className="mt-1.5 text-xs text-slate-500">
              With this off, nothing goes out by itself; the buttons on System health still work. Test mode (above) also
              applies: it only logs what would be sent.
            </p>

            {fieldLabel("waFollowTemplate", "Follow-up template name (optional)")}
            <input
              className={inputClass}
              value={form.waFollowTemplate}
              onChange={(e) => update({ waFollowTemplate: e.target.value })}
              placeholder="Leave empty to use the patient template"
              spellCheck={false}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              A template of its own, with fixed text and the report PDF as its document header (no values to fill in), so
              the people on call don&apos;t get the patient wording. Same WhatsApp number and language as above.
            </p>

            {fieldLabel("followUpTime", "Send at")}
            <input
              type="time"
              className={`${inputClass} max-w-[10rem]`}
              value={form.followUpTime}
              onChange={(e) => update({ followUpTime: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              On each person&apos;s day of the week.
            </p>

            {fieldLabel("browserPath", "Chrome or Edge path (optional)")}
            <input
              className={inputClass}
              value={form.browserPath}
              onChange={(e) => update({ browserPath: e.target.value })}
              placeholder="Found automatically, or e.g. C:\Program Files\Google\Chrome\Application\chrome.exe"
              spellCheck={false}
            />
            <p className="mt-1.5 text-xs text-slate-500">Used to turn the report page into a PDF.</p>
          </Section>

          <Section
            icon={FolderInput}
            title="Diagnostics"
            description="Log what triggered each sync and how long it took, in the server console."
            source={resets.has("debug") ? undefined : settings.sources.debug}
            onReset={() => reset("debug")}
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.debug}
                onChange={(e) => update({ debug: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
              />
              Log sync details
            </label>
          </Section>
        </div>

        <div className="sticky bottom-0 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-canvas/90 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          {saved && (
            <span className="mr-auto flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Saved and applied
            </span>
          )}
          <button
            type="button"
            onClick={runTest}
            disabled={!!busy}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-white disabled:opacity-60"
          >
            {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Test
          </button>
          {/* Only offered when there is something to save */}
          {(isDirty || busy === "save") && (
            <button
              type="button"
              onClick={save}
              disabled={!!busy}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-linear-to-r from-brand-600 to-teal-500 px-5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:brightness-110 disabled:opacity-60"
            >
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save and apply
            </button>
          )}
        </div>
      </PageBody>
    </>
  );
}
