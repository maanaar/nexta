// Merges a job's PDFs (330930.pdf, 330930_2.pdf, …) into one, in print order.
// Done on the fly when someone opens it; the original files are never changed.
import { PDFDocument } from "pdf-lib";
import { readJobPdf } from "@/lib/etiam-sync";
import { pdfSources, type JobRow } from "@/lib/nexta-db";

export async function mergeJobPdfs(job: JobRow): Promise<Buffer | null> {
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
