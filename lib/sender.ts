// The background sender: when "Send reports automatically" is on, it sends every
// report that is ready (a PDF and a valid number) once its wait has passed, and
// sends again any report whose PDF changed after it was sent.
//
// It never sends from inside the sync: the sync only decides the state, and this
// picks the jobs up afterwards, so a slow upload can't hold up new print jobs.
// The Send button and this share startSend(), which claims each job atomically.
import { getConfig } from "@/lib/config";
import { notifyJobsChanged, onJobsChanged } from "@/lib/etiam-sync";
import { stmt } from "@/lib/nexta-db";
import { giveUp, startSend } from "@/lib/whatsapp";

// Due jobs are checked this often, since a job becomes due with the passing of time, not an event
const SWEEP_MS = 15_000;
// A burst of changes (a whole sync) is handled by one sweep
const KICK_DEBOUNCE_MS = 1_000;
const CONCURRENCY = 2;
const BATCH = 100;
// Temporary failures are retried after these waits, then the job is marked failed
const RETRY_WAITS_MS = [60_000, 5 * 60_000, 15 * 60_000];
// A job that can't even be started (e.g. an unreadable PDF) is left alone for this long
const DEFER_MS = 5 * 60_000;
// After WhatsApp refuses the token, stop trying until it has had a chance to be fixed
const AUTH_PAUSE_MS = 5 * 60_000;

type SenderState = {
  started: boolean;
  sweeping: boolean;
  kick: NodeJS.Timeout | null;
  /** Jobs not to touch before this time, with how many temporary failures they've had */
  retries: Map<number, { attempts: number; notBefore: number }>;
  /** Test mode: which version of a job was already "sent", so it isn't logged every sweep */
  dryRun: Map<number, string>;
  pausedUntil: number;
  /** Start errors already logged, so a stuck job doesn't repeat itself every sweep */
  logged: Set<string>;
};

// On globalThis, like the sync: instrumentation and the API routes are bundled separately
const g = globalThis as typeof globalThis & { __nextaSender?: SenderState };
const state: SenderState = (g.__nextaSender ??= {
  started: false,
  sweeping: false,
  kick: null,
  retries: new Map(),
  dryRun: new Map(),
  pausedUntil: 0,
  logged: new Set(),
});

type Due = { id: number; pdf_sig: string | null; whatsapp_num: string | null };

/** For System health: is automatic sending paused (WhatsApp refused the login)? */
export function senderStatus() {
  return { pausedUntil: state.pausedUntil };
}

/** Started once when the server boots (see instrumentation.ts). */
export function startSender() {
  if (state.started) return;
  state.started = true;

  // Anything still "sending" belonged to a process that no longer exists: the message
  // may or may not have gone out, so a person should check before it is sent again.
  const stale = stmt(
    `UPDATE jobs SET state = 'failed',
       last_error = 'The server restarted while this report was being sent. Check WhatsApp before sending it again.'
     WHERE state = 'sending'`
  ).run();
  if (stale.changes > 0) console.warn(`${stale.changes} report(s) were mid-send when the server stopped; marked failed.`);

  onJobsChanged(() => kickSender());
  setInterval(() => void sweep(), SWEEP_MS);
  kickSender();
}

/** Look for due jobs soon (after a sync, or after the settings were saved). */
export function kickSender() {
  if (state.kick) clearTimeout(state.kick);
  state.kick = setTimeout(() => {
    state.kick = null;
    void sweep();
  }, KICK_DEBOUNCE_MS);
}

async function sweep() {
  if (state.sweeping) return;
  state.sweeping = true;
  try {
    const cfg = getConfig();
    // Both are required to save "automatic" in Settings; checked again here in case .env says otherwise
    if (!cfg.autoSend || !cfg.sendFromDate) return;
    if (Date.now() < state.pausedUntil) return;

    // Ready (or changed after sent) and quiet for the wait period. A job with no ready_at
    // has been ready since before the wait was tracked.
    const dueBefore = new Date(Date.now() - cfg.sendDelaySeconds * 1000).toISOString();
    const due = stmt(
      `SELECT id, pdf_sig, whatsapp_num FROM jobs
       WHERE study_date >= ?
         AND (state = 'send'
              OR (state = 'done' AND sent_sig IS NOT NULL AND pdf_sig IS NOT NULL AND sent_sig <> pdf_sig))
         AND (ready_at IS NULL OR ready_at <= ?)
       ORDER BY ready_at IS NULL DESC, ready_at, id
       LIMIT ?`
    ).all(cfg.sendFromDate, dueBefore, BATCH) as Due[];

    const now = Date.now();
    const queue = due.filter((job) => {
      const wait = state.retries.get(job.id);
      if (wait && wait.notBefore > now) return false;
      return state.dryRun.get(job.id) !== `${job.pdf_sig}|${job.whatsapp_num}`;
    });

    // A small pool, so a big backlog doesn't hit WhatsApp's rate limits all at once
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker(queue)));
  } catch (err) {
    console.error("Sender sweep failed:", err);
  } finally {
    state.sweeping = false;
  }
}

async function worker(queue: Due[]) {
  for (let job = queue.shift(); job; job = queue.shift()) {
    if (Date.now() < state.pausedUntil) return;
    await sendOne(job);
  }
}

async function sendOne(job: Due) {
  const start = startSend(job.id, "auto");
  if (!start.ok) {
    // Not sendable right now; look again later rather than every sweep
    const key = `${job.id}|${start.error}`;
    if (!state.logged.has(key)) {
      state.logged.add(key);
      console.warn(`Automatic send skipped for job ${job.id}: ${start.error}`);
    }
    state.retries.set(job.id, { attempts: state.retries.get(job.id)?.attempts ?? 0, notBefore: Date.now() + DEFER_MS });
    return;
  }

  const outcome = await start.finished;
  if (outcome.ok) {
    state.retries.delete(job.id);
    if (outcome.dryRun) state.dryRun.set(job.id, `${job.pdf_sig}|${job.whatsapp_num}`);
    return;
  }
  if (outcome.authFailure) {
    state.pausedUntil = Date.now() + AUTH_PAUSE_MS;
    return;
  }
  if (!outcome.retry) {
    // sendJob already marked it failed (or invalid number); a person takes it from here
    state.retries.delete(job.id);
    return;
  }

  const attempts = (state.retries.get(job.id)?.attempts ?? 0) + 1;
  if (attempts > RETRY_WAITS_MS.length) {
    state.retries.delete(job.id);
    giveUp(job.id, `${outcome.error} (gave up after ${attempts} tries)`);
    return;
  }
  state.retries.set(job.id, { attempts, notBefore: Date.now() + RETRY_WAITS_MS[attempts - 1] });
  notifyJobsChanged([job.id]);
}
