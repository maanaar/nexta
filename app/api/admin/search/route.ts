/* app/api/admin/search/route.ts
 * The search box: patients matching a name, accession, patient ID or phone number, on any date. */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import { sharedPdfKeys } from "@/lib/nexta-db";
import { toPatientRecord } from "@/lib/patient-data";
import { searchJobs } from "@/lib/overview";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const shared = sharedPdfKeys();
    const data = searchJobs(new URL(req.url).searchParams.get("q") ?? "").map((job) => toPatientRecord(job, shared));
    return NextResponse.json({ data });
  } catch (err) {
    return apiError(err, "Searching");
  }
}
