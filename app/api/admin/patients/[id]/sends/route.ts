/* app/api/admin/patients/[id]/sends/route.ts
 * A report's WhatsApp send history, newest first (the patient page shows it). */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import { listSends } from "@/lib/nexta-db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const { id } = await params;
    const sends = listSends(Number(id)).map(({ at, trigger, phone, result, error }) => ({
      at,
      trigger,
      phone,
      result,
      error,
    }));
    return NextResponse.json({ data: sends });
  } catch (err) {
    return apiError(err, "Loading the send history");
  }
}
