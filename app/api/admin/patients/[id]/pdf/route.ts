/* app/api/admin/patients/[id]/pdf/route.ts
 * Serves a job's PDF: straight from ETIAM's database when ETIAM stores it,
 * otherwise from the file ETIAM / PDFCreator produced. */
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readJobPdf } from "@/lib/etiam-sync";
import { getJob } from "@/lib/nexta-db";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const job = getJob(Number(id));
  if (!job) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const pdf = readJobPdf(job);
  if (!pdf) return NextResponse.json({ error: "PDF not available" }, { status: 404 });

  const download = new URL(req.url).searchParams.has("download");
  const filename = `${job.patient_name || "report"} - ${job.accession || job.id}.pdf`.replace(/[^\w .-]/g, "_");

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
