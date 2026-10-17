// Compresses PDFs with Ghostscript before Nexta uses them.
//
// When a "PDF folder before compression" is set, a watcher on it compresses each
// PDF it finds and saves the result, under the same file name, in the PDF folder
// (the folder Nexta already watches and matches reports from). That second
// watcher is what starts the existing flow, so nothing downstream changes. The
// originals are left untouched in the first folder.
//
// Compression never holds a report up: if Ghostscript is missing, fails, times
// out or doesn't make the file smaller, the original is copied through instead.
// Every write into the PDF folder goes via a temporary name and a rename, so the
// other watcher never sees a half-written file.
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getConfig } from "@/lib/config";

const GS_TIMEOUT_MS = 300_000;
const CONCURRENCY = 2;
// Safety net for missed file events (network drives, sleep) and for PDFs that
// arrived while the server was down
const SCAN_MS = 60_000;
const DEBOUNCE_MS = 500;
// A file is only compressed once its size and modified time stop changing
const STABLE_WAIT_MS = 1_000;
const BUSY_RETRY_MS = 3_000;
const MB = 1024 * 1024;
// Not a ".pdf", so the PDF watcher ignores it until the rename
const TEMP_SUFFIX = ".nexta-tmp";

export type CompressResult = {
  outcome: "compressed" | "kept";
  before: number;
  after: number;
  /** In words, for the log */
  note: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isFile = (file: string) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/**
 * Ghostscript's console executable. With a configured path, only that path is
 * accepted (a typo shouldn't quietly fall back to something else); otherwise it
 * is looked for on PATH and in the usual install folders.
 */
export function findGhostscript(configured = ""): string | null {
  if (configured) return isFile(configured) ? configured : null;

  const windows = process.platform === "win32";
  const names = windows ? ["gswin64c.exe", "gswin32c.exe"] : ["gs"];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const file = path.join(dir, name);
      if (isFile(file)) return file;
    }
  }
  if (windows) {
    // C:\Program Files\gs\gs10.07.1\bin\gswin64c.exe: newest version first
    for (const root of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean) as string[]) {
      const base = path.join(root, "gs");
      let versions: string[] = [];
      try {
        versions = fs.readdirSync(base);
      } catch {
        continue;
      }
      versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of versions) {
        for (const name of names) {
          const file = path.join(base, version, "bin", name);
          if (isFile(file)) return file;
        }
      }
    }
  }
  return null;
}

function runGhostscript(gs: string, src: string, out: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Arguments go straight to the program (no shell), and -dSAFER keeps a hostile PDF
    // from touching files. "ebook" is Ghostscript's 150 dpi preset.
    const child = spawn(
      gs,
      [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dPDFSETTINGS=/ebook",
        "-dSAFER",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        `-sOutputFile=${out}`,
        src,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    let output = "";
    const collect = (chunk: Buffer) => {
      if (output.length < 500) output += chunk.toString();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Ghostscript took longer than ${GS_TIMEOUT_MS / 1000} s`));
    }, GS_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Ghostscript exited with code ${code}${output ? `: ${output.trim()}` : ""}`));
    });
  });
}

/** Windows refuses to replace a file that something else has open for a moment; try again. */
async function renameWithRetry(from: string, to: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err: any) {
      if (!["EBUSY", "EPERM", "EACCES"].includes(err?.code) || attempt >= 8) throw err;
      await sleep(250 * attempt);
    }
  }
}

/**
 * Compresses `src` into `dst`. Files under `minBytes` are copied unchanged, and
 * so is any file Ghostscript can't shrink. `gs` null means Ghostscript wasn't found.
 */
export async function compressPdf(gs: string | null, src: string, dst: string, minBytes: number): Promise<CompressResult> {
  const before = fs.statSync(src).size;
  const temp = dst + TEMP_SUFFIX;

  const keep = async (note: string): Promise<CompressResult> => {
    fs.copyFileSync(src, temp);
    await renameWithRetry(temp, dst);
    return { outcome: "kept", before, after: before, note };
  };

  try {
    if (before < minBytes) return await keep(`under ${(minBytes / MB).toLocaleString()} MB, copied unchanged`);
    if (!gs) return await keep("Ghostscript not found, original copied");

    try {
      await runGhostscript(gs, src, temp);
      const after = fs.statSync(temp).size;
      if (after > 0 && after < before) {
        await renameWithRetry(temp, dst);
        return { outcome: "compressed", before, after, note: "compressed" };
      }
      return await keep("no size gain, original copied");
    } catch (err: any) {
      return await keep(`failed (${err?.message ?? err}), original copied`);
    }
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

// ---------------------------------------------------------------- watcher

type CompressState = {
  started: boolean;
  watcher: fs.FSWatcher | null;
  watchedDir: string;
  warned: boolean;
  queue: string[];
  /** Waiting or being compressed */
  queued: Set<string>;
  running: Set<string>;
  /** Changed again while being compressed: do it once more afterwards */
  again: Set<string>;
  active: number;
  /** "size:mtime" of each source already compressed, so the scan doesn't redo it */
  done: Map<string, string>;
  /** Files the last scan left alone because they are older than the cut-off date, and the newest of them */
  skippedOld: number;
  newestSkipped: number | null;
};

/** How the compressor is doing, for System health: files waiting, being prepared, and left alone as too old. */
export function compressStatus() {
  return { waiting: state.queue.length, active: state.active, skippedOld: state.skippedOld, newestSkipped: state.newestSkipped };
}

// On globalThis, like the sync: instrumentation and the API routes are bundled separately
const g = globalThis as typeof globalThis & { __nextaCompress?: CompressState };
const state: CompressState = (g.__nextaCompress ??= {
  started: false,
  watcher: null,
  watchedDir: "",
  warned: false,
  queue: [],
  queued: new Set(),
  running: new Set(),
  again: new Set(),
  active: 0,
  done: new Map(),
  skippedOld: 0,
  newestSkipped: null,
});

/** Started once when the server boots (see instrumentation.ts). */
export function startCompressor() {
  if (state.started) return;
  state.started = true;
  attach();
  void scan();
  setInterval(() => {
    attach();
    void scan();
  }, SCAN_MS);
}

/** Applies saved settings: watch the new folder and look for files not yet compressed. */
export function applyCompressionConfig() {
  state.warned = false;
  attach();
  void scan();
}

function detach() {
  state.watcher?.close();
  state.watcher = null;
  state.watchedDir = "";
}

function attach() {
  const { pdfInDir, pdfDir } = getConfig();
  if (!pdfInDir || !pdfDir) return detach();
  if (state.watcher && state.watchedDir === pdfInDir) return;
  detach();
  try {
    const watcher = fs.watch(pdfInDir, (_event, file) => {
      if (!file) return void scan();
      const name = file.toString();
      // A file arriving now is always prepared (whatever the cut-off date), and goes to the front of the line
      if (/\.pdf$/i.test(name)) setTimeout(() => enqueue(name, true), DEBOUNCE_MS);
    });
    watcher.on("error", (err) => {
      console.error(`Stopped watching ${pdfInDir} for PDFs to compress:`, err.message);
      watcher.close();
      if (state.watcher === watcher) detach();
    });
    state.watcher = watcher;
    state.watchedDir = pdfInDir;
    console.log(`Watching ${pdfInDir} for PDFs to compress into ${pdfDir}`);
  } catch (err: any) {
    // Retried on the next scan, logged once
    if (!state.warned) console.error(`Can't watch ${pdfInDir} for PDFs to compress (will keep retrying):`, err.message);
    state.warned = true;
  }
}

/** Start of a YYYY-MM-DD day in local time, in ms */
const dayStart = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

/**
 * Queues the PDFs in the input folder whose compressed copy is missing or older: newest first, and
 * only those saved on or after the cut-off date (if one is set), so an old backlog is never prepared.
 */
async function scan() {
  const { pdfInDir, pdfDir } = getConfig();
  if (!pdfInDir || !pdfDir) return;
  let names: string[];
  try {
    names = fs.readdirSync(pdfInDir).filter((n) => /\.pdf$/i.test(n));
  } catch {
    return; // folder missing for now
  }
  const { compressFromDate } = getConfig();
  const cutoff = compressFromDate ? dayStart(compressFromDate) : null;
  const pending: { name: string; mtime: number }[] = [];
  let skipped = 0;
  let newestSkipped: number | null = null;
  for (const name of names) {
    try {
      const source = fs.statSync(path.join(pdfInDir, name));
      if (!source.isFile()) continue;
      const signature = `${source.size}:${source.mtimeMs}`;
      if (state.done.get(name) === signature) continue;
      if (cutoff !== null && source.mtimeMs < cutoff && !state.queued.has(name)) {
        skipped++;
        if (newestSkipped === null || source.mtimeMs > newestSkipped) newestSkipped = source.mtimeMs;
        continue;
      }
      try {
        // Compressed after this version of the file was written: nothing to do
        if (fs.statSync(path.join(pdfDir, name)).mtimeMs >= source.mtimeMs) {
          state.done.set(name, signature);
          continue;
        }
      } catch {
        // no compressed copy yet
      }
      pending.push({ name, mtime: source.mtimeMs });
    } catch {
      // removed while scanning
    }
  }
  state.skippedOld = skipped;
  state.newestSkipped = newestSkipped;
  pending.sort((x, y) => y.mtime - x.mtime);
  for (const { name } of pending) enqueue(name);
}

function enqueue(name: string, urgent = false) {
  if (state.queued.has(name)) {
    if (state.running.has(name)) state.again.add(name);
    return;
  }
  state.queued.add(name);
  if (urgent) state.queue.unshift(name);
  else state.queue.push(name);
  pump();
}

function pump() {
  while (state.active < CONCURRENCY && state.queue.length > 0) {
    const name = state.queue.shift()!;
    state.active++;
    state.running.add(name);
    processFile(name)
      .then((retryLater) => {
        if (retryLater) setTimeout(() => enqueue(name), BUSY_RETRY_MS);
      })
      .catch((err) => console.error(`Compressing ${name} failed: ${err?.message ?? err}`))
      .finally(() => {
        state.active--;
        state.running.delete(name);
        state.queued.delete(name);
        // Watcher events keep arriving while a file is being written, so only go again
        // if the file really is different from the version just compressed
        if (state.again.delete(name) && changedSinceCompressed(name)) enqueue(name);
        pump();
      });
  }
}

function changedSinceCompressed(name: string): boolean {
  try {
    const source = fs.statSync(path.join(getConfig().pdfInDir, name));
    return state.done.get(name) !== `${source.size}:${source.mtimeMs}`;
  } catch {
    return false; // removed
  }
}

/** Resolves true when the file is still being written and should be looked at again shortly. */
async function processFile(name: string): Promise<boolean> {
  const { pdfInDir, pdfDir, gsPath, compressMinMb } = getConfig();
  if (!pdfInDir || !pdfDir || name !== path.basename(name)) return false;
  // Ghostscript reads % in an output name as a pattern
  if (name.includes("%")) {
    console.warn(`Not compressing ${name}: a % in the file name isn't supported`);
    return false;
  }
  const src = path.join(pdfInDir, name);
  const dst = path.join(pdfDir, name);

  let before;
  try {
    before = fs.statSync(src);
    await sleep(STABLE_WAIT_MS);
    const after = fs.statSync(src);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) return true;
    before = after;
  } catch {
    return false; // deleted
  }

  fs.mkdirSync(pdfDir, { recursive: true });
  const started = Date.now();
  const result = await compressPdf(findGhostscript(gsPath), src, dst, compressMinMb * MB);
  state.done.set(name, `${before.size}:${before.mtimeMs}`);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const percent = result.before ? Math.round((100 * result.after) / result.before) : 100;
  console.log(
    `[compress] ${name}: ${result.before.toLocaleString()} -> ${result.after.toLocaleString()} bytes ` +
      `(${percent}% of original) in ${seconds} s: ${result.note}`
  );
  return false;
}
