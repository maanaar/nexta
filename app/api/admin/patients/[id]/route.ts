/* app/api/admin/patients/[id]/route.ts */
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { notifyJobsChanged } from "@/lib/etiam-sync";
import { setManualPhone } from "@/lib/nexta-db";
import { toPatientRecord } from "@/lib/patient-data";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const phone = typeof body.whatsappNum === "string" ? body.whatsappNum.trim() : null;

  if (phone === null) {
    return NextResponse.json({ error: "whatsappNum is required" }, { status: 400 });
  }
  if (phone && !/^\+?[\d\s-]{7,20}$/.test(phone)) {
    return NextResponse.json({ error: "Enter a valid phone number (digits, spaces, + and - only)" }, { status: 400 });
  }

  const job = setManualPhone(Number(id), phone.replace(/[\s-]/g, ""));
  if (!job) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  // Other open dashboards pick up the new number right away
  notifyJobsChanged();

  return NextResponse.json({ data: toPatientRecord(job) });
}
