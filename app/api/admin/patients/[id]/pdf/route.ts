/* app/api/admin/patients/[id]/pdf/route.ts
 * Serves a job's PDF: ?n=all merges every file into one (in print order),
 * ?n=0 / ?n=1 / … serves a single file. PDFs come straight from ETIAM's
 * database when ETIAM stores them, otherwise from the PDF folder. */
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readJobPdf } from "@/lib/etiam-sync";
import { getJob } from "@/lib/nexta-db";
import { mergeJobPdfs } from "@/lib/pdf-merge";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const job = getJob(Number(id));
  if (!job) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const url = new URL(req.url);
  const all = url.searchParams.get("n") === "all";
  const index = all ? 0 : Math.max(0, Number(url.searchParams.get("n")) || 0);
  const pdf = all ? await mergeJobPdfs(job) : readJobPdf(job, index);
  if (!pdf) return NextResponse.json({ error: "PDF not available" }, { status: 404 });

  const download = url.searchParams.has("download");
  const part = all ? "" : index > 0 ? `_${index + 1}` : "";
  const filename = `${job.patient_name || "report"} - ${job.accession || job.id}${part}.pdf`.replace(/[^\w .-]/g, "_");

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
