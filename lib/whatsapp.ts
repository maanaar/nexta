// Sends a job's report PDF over WhatsApp (Meta Cloud API): the PDF is read into
// memory, uploaded to Meta as media, then sent with an approved template whose
// header is that document. Nothing is written to disk or needs cleaning up.
//
// startSend() is the one entry point, used by the Send button (manual) and the
// background sender (auto). It checks the job, claims it atomically
// (send -> sending) so the two can never send the same report twice, and returns
// at once; the upload carries on and `finished` settles with the outcome.
import fs from "fs";
import { getConfig, WHATSAPP_API_VERSION, type Config } from "@/lib/config";
import { jobPdfFile, notifyJobsChanged, readJobPdf } from "@/lib/etiam-sync";
import { getJob, logSend, pdfSources, stmt, type JobRow, type JobState, type SendLogRow } from "@/lib/nexta-db";
import { mergePdfBytes } from "@/lib/pdf-merge";
import { combineHashes, hashBytes } from "@/lib/pdf-sig";
import { normalizePhone } from "@/lib/phone";
import { sendBlockedReason } from "@/lib/send-rules";

export type SendTrigger = SendLogRow["trigger"];

export type SendOutcome =
  | { ok: true; dryRun: boolean }
  | { ok: false; error: string; /** worth trying again later (network, rate limit) */ retry: boolean; /** the access token was refused */ authFailure: boolean };

export type SendStart = { ok: true; finished: Promise<SendOutcome> } | { ok: false; error: string };

// WhatsApp accepts documents up to 100 MB
const MAX_BYTES = 100 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 300_000;
const SEND_TIMEOUT_MS = 30_000;

class SendError extends Error {
  constructor(
    message: string,
    readonly retry = false,
    readonly authFailure = false,
    /** state to leave the job in when this ends it (default: failed) */
    readonly state: JobState = "failed"
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks the job and claims it. Returns an error straight away when it can't be
 * sent (no PDF, invalid number, before the start date, already being sent …);
 * otherwise the upload runs in the background and `finished` settles when done.
 */
export function startSend(id: number, trigger: SendTrigger): SendStart {
  const cfg = getConfig();
  const job = getJob(id);
  if (!job) return { ok: false, error: "Patient not found" };

  const blocked = sendBlockedReason(job, cfg);
  if (blocked) return { ok: false, error: blocked };

  // Auto only takes jobs that are ready, or whose PDF changed after they were sent.
  // A manual send can also retry a failed one or resend a sent one.
  const claim = stmt(
    trigger === "manual"
      ? `UPDATE jobs SET state = 'sending', last_error = NULL
         WHERE id = ? AND state IN ('send', 'failed', 'done')`
      : `UPDATE jobs SET state = 'sending', last_error = NULL
         WHERE id = ? AND (state = 'send'
            OR (state = 'done' AND sent_sig IS NOT NULL AND pdf_sig IS NOT NULL AND sent_sig <> pdf_sig))`
  );
  if (claim.run(id).changes === 0) {
    return { ok: false, error: "This report isn't ready to send, or it is already being sent." };
  }
  notifyJobsChanged([id]);

  const finished = run(job, job.state, trigger, cfg).then((outcome) => {
    notifyJobsChanged([id]);
    return outcome;
  });
  return { ok: true, finished };
}

/** Stops auto-retrying a job and marks it failed (the sender gave up). */
export function giveUp(id: number, error: string) {
  stmt("UPDATE jobs SET state = 'failed', last_error = ? WHERE id = ? AND state IN ('send', 'done')").run(error, id);
  notifyJobsChanged([id]);
}

async function run(job: JobRow, previous: JobState, trigger: SendTrigger, cfg: Config): Promise<SendOutcome> {
  const number = normalizePhone(job.whatsapp_num, job.country_code);
  const phone = number.ok ? number.phone : job.whatsapp_num ?? "";
  let sig: string | null = null;

  try {
    // Read every PDF into memory. A file that is still being written is retried later.
    const parts: Buffer[] = [];
    for (let n = 0; n < pdfSources(job.pdf_ref).length; n++) {
      const file = jobPdfFile(job, n);
      if (file) await waitUntilStable(file);
      const bytes = readJobPdf(job, n);
      if (!bytes) throw new SendError("A PDF file is missing. Check the PDF folder.");
      parts.push(bytes);
    }
    if (parts.length === 0) throw new SendError("The PDF hasn't been found.");

    // Fingerprint of exactly what is sent, to tell later if the report changed after
    sig = combineHashes(parts.map(hashBytes));
    const pdf = parts.length === 1 ? parts[0] : await mergePdfBytes(parts);
    if (!pdf) throw new SendError("The PDF couldn't be read.");
    if (pdf.length > MAX_BYTES) throw new SendError("The PDF is larger than WhatsApp's 100 MB limit.");

    const filename = `Report_${(job.accession || String(job.id)).replace(/[^\w.-]/g, "_")}.pdf`;

    if (cfg.waDryRun) {
      console.log(`[whatsapp] dry run: would send ${filename} (${pdf.length} bytes) to +${phone} for job ${job.id}`);
      stmt("UPDATE jobs SET state = ?, last_error = NULL WHERE id = ?").run(previous, job.id);
      logSend({ job_id: job.id, trigger, phone, sig, result: "dry_run", message_id: null, error: null });
      return { ok: true, dryRun: true };
    }

    const mediaId = await uploadMedia(cfg, pdf, filename);
    const messageId = await sendTemplate(cfg, phone, mediaId, filename);

    stmt(
      `UPDATE jobs SET state = 'done', sent_at = ?, sent_sig = ?, last_error = NULL, wa_message_id = ? WHERE id = ?`
    ).run(new Date().toISOString(), sig, messageId, job.id);
    logSend({ job_id: job.id, trigger, phone, sig, result: "done", message_id: messageId, error: null });
    return { ok: true, dryRun: false };
  } catch (err: any) {
    const failure = err instanceof SendError ? err : new SendError(`Unexpected error: ${err?.message ?? err}`);
    // The sender retries temporary problems on its own, so the job goes back where it was.
    // A person clicking Send wants to see the failure, so for them it stays failed.
    const state: JobState = trigger === "auto" && failure.retry ? previous : failure.state;
    stmt("UPDATE jobs SET state = ?, last_error = ? WHERE id = ?").run(state, failure.message, job.id);
    logSend({ job_id: job.id, trigger, phone, sig, result: "failed", message_id: null, error: failure.message });
    console.error(`WhatsApp send failed for job ${job.id}: ${failure.message}`);
    return { ok: false, error: failure.message, retry: failure.retry, authFailure: failure.authFailure };
  }
}

/** ETIAM or the PDF generator may still be writing the file: wait for its size to settle. */
async function waitUntilStable(file: string) {
  const before = fs.statSync(file);
  await sleep(400);
  const after = fs.statSync(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new SendError("The PDF is still being written. It will be tried again.", true);
  }
}

async function metaRequest(url: string, init: RequestInit, timeoutMs: number) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err: any) {
    throw new SendError(`Couldn't reach WhatsApp (network problem or timeout): ${err?.message ?? err}`, true);
  }
  const body = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, ok: res.ok, body };
}

function metaError(status: number, body: any, what: string): SendError {
  const code: number | undefined = body?.error?.code;
  const message: string = body?.error?.message ?? `HTTP ${status}`;
  if (status === 401 || status === 403 || code === 190) {
    return new SendError(`WhatsApp refused the access token (${message}). Update it in Server settings.`, false, true);
  }
  // "Message undeliverable": the number isn't on WhatsApp
  if (code === 131026) return new SendError("This number isn't on WhatsApp.", false, false, "no_whatsapp");
  const temporary = status === 429 || status >= 500;
  return new SendError(`${what} failed (HTTP ${status}${code ? `, code ${code}` : ""}): ${message}`, temporary);
}

async function uploadMedia(cfg: Config, pdf: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), filename);

  const res = await metaRequest(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(cfg.waPhoneNumberId)}/media`,
    { method: "POST", headers: { Authorization: `Bearer ${cfg.waToken}` }, body: form },
    UPLOAD_TIMEOUT_MS
  );
  if (!res.ok || !res.body?.id) throw metaError(res.status, res.body, "Uploading the PDF to WhatsApp");
  return String(res.body.id);
}

async function sendTemplate(cfg: Config, phone: string, mediaId: string, filename: string): Promise<string> {
  const res = await metaRequest(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(cfg.waPhoneNumberId)}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.waToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: cfg.waTemplate,
          language: { code: cfg.waLang },
          components: [
            { type: "header", parameters: [{ type: "document", document: { id: mediaId, filename } }] },
          ],
        },
      }),
    },
    SEND_TIMEOUT_MS
  );
  const messageId = res.body?.messages?.[0]?.id;
  if (!res.ok || !messageId) throw metaError(res.status, res.body, "Sending the message");
  return String(messageId);
}
