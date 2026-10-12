/* app/api/admin/patients/[id]/pdf/route.ts
 * Serves a job's PDF: ?n=all merges every file into one (in print order,
 * cached on disk), ?n=0 / ?n=1 / … serves a single file. Files are streamed
 * from disk rather than loaded into memory; PDFs stored inside ETIAM's
 * database are read from there. */
import fs from "fs";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import { jobPdfFile, readJobPdf } from "@/lib/etiam-sync";
import { getJob } from "@/lib/nexta-db";
import { mergedPdf } from "@/lib/pdf-merge";

export const dynamic = "force-dynamic";

function pdfResponse(source: { file: string } | { bytes: Buffer }, filename: string, download: boolean) {
  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  };
  if ("file" in source) {
    headers["Content-Length"] = String(fs.statSync(source.file).size);
    const stream = Readable.toWeb(fs.createReadStream(source.file)) as ReadableStream<Uint8Array>;
    return new Response(stream, { headers });
  }
  headers["Content-Length"] = String(source.bytes.length);
  return new Response(new Uint8Array(source.bytes), { headers });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { id } = await params;
    const job = getJob(Number(id));
    if (!job) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

    const url = new URL(req.url);
    const all = url.searchParams.get("n") === "all";
    const index = all ? 0 : Math.max(0, Number(url.searchParams.get("n")) || 0);

    let source: { file: string } | { bytes: Buffer } | null;
    if (all) {
      source = await mergedPdf(job);
    } else {
      const file = jobPdfFile(job, index);
      const bytes = file ? null : readJobPdf(job, index); // stored inside ETIAM's database
      source = file ? { file } : bytes ? { bytes } : null;
    }
    if (!source) return NextResponse.json({ error: "PDF not available" }, { status: 404 });

    const part = all ? "" : index > 0 ? `_${index + 1}` : "";
    const filename = `${job.patient_name || "report"} - ${job.accession || job.id}${part}.pdf`.replace(/[^\w .-]/g, "_");
    return pdfResponse(source, filename, url.searchParams.has("download"));
  } catch (err) {
    return apiError(err, "Loading the PDF");
  }
}
