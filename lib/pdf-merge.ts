// Merges a job's PDFs (330930.pdf, 330930_2.pdf, …) into one, in print order.
// The result is cached on disk and rebuilt only when a source file changes
// (or a new print like _3 arrives); the original files are never touched.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { jobPdfFile, readJobPdf } from "@/lib/etiam-sync";
import { pdfSources, type JobRow } from "@/lib/nexta-db";

// Next to nexta.db, so it moves with NEXTA_DB_PATH
const CACHE_DIR = path.join(
  path.dirname(process.env.NEXTA_DB_PATH || path.join(process.cwd(), "data", "nexta.db")),
  "merged"
);

async function buildMerged(job: JobRow): Promise<Buffer | null> {
  const merged = await PDFDocument.create();

  for (let n = 0; n < pdfSources(job.pdf_ref).length; n++) {
    const bytes = readJobPdf(job, n);
    if (!bytes) continue; // file removed since the last sync
    try {
      // Some generators mark PDFs as encrypted with an empty password; pages still copy fine
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    } catch (err: any) {
      // Skip a damaged file rather than losing the whole report
      console.error(`Can't merge PDF ${n + 1} of job ${job.id}:`, err.message);
    }
  }

  if (merged.getPageCount() === 0) return null;
  return Buffer.from(await merged.save());
}

/**
 * The merged PDF for a job: a cached file on disk when every source is a file,
 * or bytes when a source lives inside ETIAM's database (not cached, since it
 * can't be fingerprinted without reading it).
 */
export async function mergedPdf(job: JobRow): Promise<{ file: string } | { bytes: Buffer } | null> {
  const count = pdfSources(job.pdf_ref).length;
  const files = Array.from({ length: count }, (_, n) => jobPdfFile(job, n));

  if (files.some((f) => !f)) {
    const bytes = await buildMerged(job);
    return bytes ? { bytes } : null;
  }

  // Fingerprint of the sources: changes when any file is replaced or a print is added
  const fingerprint = crypto
    .createHash("sha1")
    .update(JSON.stringify(files.map((f) => [f, fs.statSync(f!).size, fs.statSync(f!).mtimeMs])))
    .digest("hex")
    .slice(0, 16);
  const cached = path.join(CACHE_DIR, `${job.id}-${fingerprint}.pdf`);
  if (fs.existsSync(cached)) return { file: cached };

  const bytes = await buildMerged(job);
  if (!bytes) return null;

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  // Write then rename, so a half-written file is never served
  const tmp = `${cached}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, cached);

  // Drop this job's older merges
  for (const name of fs.readdirSync(CACHE_DIR)) {
    if (name.startsWith(`${job.id}-`) && name.endsWith(".pdf") && name !== path.basename(cached)) {
      fs.rmSync(path.join(CACHE_DIR, name), { force: true });
    }
  }
  return { file: cached };
}
