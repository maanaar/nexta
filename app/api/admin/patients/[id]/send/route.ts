/* app/api/admin/patients/[id]/send/route.ts
 * The Send button: sends this report over WhatsApp now. The job is checked and
 * claimed before this answers (so "no PDF", "invalid number" and "already being
 * sent" come back as errors), then the upload carries on in the background; the
 * live-update stream moves the card to Sent or Failed when it finishes. */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import { getJob, sharedPdfKeys } from "@/lib/nexta-db";
import { toPatientRecord } from "@/lib/patient-data";
import { startSend } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const { id } = await params;
    const start = startSend(Number(id), "manual");
    if (!start.ok) return NextResponse.json({ error: start.error }, { status: 409 });

    // Don't wait for the upload; its outcome is recorded on the job
    void start.finished;
    return NextResponse.json({ data: toPatientRecord(getJob(Number(id))!, sharedPdfKeys()) }, { status: 202 });
  } catch (err) {
    return apiError(err, "Sending the report");
  }
}
