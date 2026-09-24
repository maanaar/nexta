/* app/api/admin/patients/route.ts */
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { syncIfStale, syncNow } from "@/lib/etiam-sync";
import { listJobs } from "@/lib/nexta-db";
import { toPatientRecord } from "@/lib/patient-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // "Refresh" in the UI asks for an immediate sync; background polling doesn't
  const force = new URL(req.url).searchParams.has("sync");
  const sync = force ? await syncNow() : await syncIfStale();
  const data = listJobs().map(toPatientRecord);
  return NextResponse.json({ data, sync });
}
