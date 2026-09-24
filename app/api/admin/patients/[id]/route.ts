/* app/api/admin/patients/[id]/route.ts */
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { notifyJobsChanged } from "@/lib/etiam-sync";
import { setManualPhone, setManualState, StateChangeError, type JobState } from "@/lib/nexta-db";
import { toPatientRecord } from "@/lib/patient-data";

const MOVABLE_STATES: JobState[] = ["no_number", "send", "done", "failed", "no_whatsapp", "signed_out"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  let job;
  if (typeof body.state === "string") {
    // Drag and drop on the organizer board
    if (!MOVABLE_STATES.includes(body.state)) {
      return NextResponse.json({ error: "Unknown state" }, { status: 400 });
    }
    try {
      job = setManualState(Number(id), body.state as JobState);
    } catch (err) {
      if (err instanceof StateChangeError) return NextResponse.json({ error: err.message }, { status: 409 });
      throw err;
    }
  } else if (typeof body.whatsappNum === "string") {
    const phone = body.whatsappNum.trim();
    if (phone && !/^\+?[\d\s-]{7,20}$/.test(phone)) {
      return NextResponse.json({ error: "Enter a valid phone number (digits, spaces, + and - only)" }, { status: 400 });
    }
    job = setManualPhone(Number(id), phone.replace(/[\s-]/g, ""));
  } else {
    return NextResponse.json({ error: "Send whatsappNum or state" }, { status: 400 });
  }

  if (!job) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  // Other open dashboards pick up the change right away
  notifyJobsChanged();

  return NextResponse.json({ data: toPatientRecord(job) });
}
