/* app/api/admin/overview/route.ts
 * What ETIAM has against what Nexta received for the chosen dates and exam type, and when the last exam and
 * the last report arrived. The Board's "Received 128 / 130" comes from here. */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import { boardOverview, parseFilters } from "@/lib/overview";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { range, modality } = parseFilters(new URL(req.url).searchParams);
    return NextResponse.json({ data: boardOverview(range, modality) });
  } catch (err) {
    return apiError(err, "Loading the overview");
  }
}
