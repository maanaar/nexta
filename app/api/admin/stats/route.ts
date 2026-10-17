/* app/api/admin/stats/route.ts
 * The journey of an exam (how many reached each step), how long each step takes, and message counts. */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import { parseFilters, systemStats } from "@/lib/overview";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { range, modality } = parseFilters(new URL(req.url).searchParams);
    return NextResponse.json({ data: systemStats(range, modality) });
  } catch (err) {
    return apiError(err, "Loading the statistics");
  }
}
