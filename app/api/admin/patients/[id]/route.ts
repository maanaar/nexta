/* app/api/admin/patients/[id]/route.ts */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import { notifyJobsChanged } from "@/lib/etiam-sync";
import { getJob, setManualPhone, setManualState, sharedPdfKeys, StateChangeError, type JobState } from "@/lib/nexta-db";
import { toPatientRecord } from "@/lib/patient-data";
import { COUNTRIES, normalizePhone } from "@/lib/phone";

/** One patient, for the patient page (no need to load the whole list). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const { id } = await params;
    const job = getJob(Number(id));
    if (!job) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    return NextResponse.json({ data: toPatientRecord(job, sharedPdfKeys()) });
  } catch (err) {
    return apiError(err, "Loading the patient");
  }
}

const MOVABLE_STATES: JobState[] = ["no_number", "send", "done", "failed", "no_whatsapp", "signed_out"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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
      // The country defaults to what the job already has (Egypt unless changed)
      const current = getJob(Number(id));
      if (!current) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
      const countryCode = typeof body.countryCode === "string" ? body.countryCode : current.country_code;
      if (!COUNTRIES.some((c) => c.code === countryCode)) {
        return NextResponse.json({ error: "Choose a country from the list" }, { status: 400 });
      }

      const typed = body.whatsappNum.trim();
      let stored = "";
      if (typed) {
        const number = normalizePhone(typed, countryCode);
        if (!number.ok) return NextResponse.json({ error: number.error }, { status: 400 });
        stored = number.stored;
      }
      try {
        job = setManualPhone(Number(id), stored, countryCode);
      } catch (err) {
        if (err instanceof StateChangeError) return NextResponse.json({ error: err.message }, { status: 409 });
        throw err;
      }
    } else {
      return NextResponse.json({ error: "Send whatsappNum or state" }, { status: 400 });
    }

    if (!job) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

    // Other open dashboards pick up the change right away
    notifyJobsChanged([job.id]);

    return NextResponse.json({ data: toPatientRecord(job, sharedPdfKeys()) });
  } catch (err) {
    return apiError(err, "Saving the change");
  }
}
