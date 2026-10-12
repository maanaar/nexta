/* app/api/admin/patients/route.ts */
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { syncIfStale, syncNow } from "@/lib/etiam-sync";
import { listJobs, listJobsByIds, sharedPdfKeys } from "@/lib/nexta-db";
import { toPatientRecord } from "@/lib/patient-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = new URL(req.url);
  // "Refresh" asks for an immediate sync; reloads after a live push don't need one
  const force = url.searchParams.has("sync");
  const sync = force ? await syncNow() : await syncIfStale();

  // The date filter runs in the database, so "Today" sends today's rows only
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const range = {
    from: from && day.test(from) ? from : null,
    to: to && day.test(to) ? to : null,
  };
  const shared = sharedPdfKeys();

  // After a live push: only the jobs that changed (those still in the range)
  const idsParam = url.searchParams.get("ids");
  if (idsParam !== null) {
    const ids = idsParam.split(",").map(Number).filter(Number.isInteger).slice(0, 200);
    const data = listJobsByIds(ids, range).map((job) => toPatientRecord(job, shared));
    return NextResponse.json({ data, sync });
  }

  const { rows, total } = listJobs(range);
  const data = rows.map((job) => toPatientRecord(job, shared));
  return NextResponse.json({ data, total, sync });
}
