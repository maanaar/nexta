/* app/api/admin/follow-up/send/route.ts
 * "Send today's report now": to one line (any day) or to everyone scheduled for today who hasn't had it yet.
 * Always sends for real (test mode only covers the automatic send). Admins only. */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { getAdmin } from "@/lib/auth";
import { sendFollowUpNow } from "@/lib/follow-up";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!(await getAdmin())) return NextResponse.json({ error: "Only admins can send the follow-up report" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const contactId = Number(body.contactId);
    const results = await sendFollowUpNow(Number.isInteger(contactId) && contactId > 0 ? contactId : undefined);
    return NextResponse.json({ data: results });
  } catch (err) {
    return apiError(err, "Sending the follow-up report");
  }
}
