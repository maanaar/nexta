/* app/api/admin/health/route.ts
 * Is everything working: the imaging system, phone numbers, WhatsApp, the report folders and the sender.
 * ?check=1 also asks Meta whether the WhatsApp login still works (a network call, so only when asked). */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import { healthSnapshot } from "@/lib/overview";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const check = new URL(req.url).searchParams.has("check");
    return NextResponse.json({ data: await healthSnapshot(check) });
  } catch (err) {
    return apiError(err, "Checking the system");
  }
}
