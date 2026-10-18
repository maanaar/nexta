/* app/api/admin/follow-up/route.ts
 * The follow-up schedule on System health: who gets the report on WhatsApp, and on which day of the week.
 * GET reads it (any signed-in user); PUT saves the whole list as it is on screen (admins only). */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { getAdmin, isAuthenticated } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { listContacts, saveContacts, type ContactInput } from "@/lib/follow-up";
import { REPORT_DAYS_BACK, daysBefore, localDay } from "@/lib/follow-up-report";
import { findBrowser } from "@/lib/html-pdf";

export const dynamic = "force-dynamic";

function payload() {
  const cfg = getConfig();
  const today = localDay();
  return {
    contacts: listContacts(),
    today: { date: today, dayOfWeek: new Date().getDay() },
    reportDay: daysBefore(today, REPORT_DAYS_BACK),
    settings: {
      siteName: cfg.siteName,
      auto: cfg.followUpAuto,
      time: cfg.followUpTime,
      templateSet: cfg.waTemplate !== "",
      whatsappSet: cfg.waPhoneNumberId !== "" && cfg.waToken !== "",
      testMode: cfg.waDryRun,
      browserFound: findBrowser() !== null,
    },
  };
}

export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    return NextResponse.json({ data: payload() });
  } catch (err) {
    return apiError(err, "Loading the follow-up schedule");
  }
}

export async function PUT(req: Request) {
  try {
    if (!(await getAdmin())) return NextResponse.json({ error: "Only admins can change the follow-up schedule" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body.contacts)) return NextResponse.json({ error: "Send the list of lines" }, { status: 400 });
    const saved = saveContacts(body.contacts as ContactInput[]);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
    return NextResponse.json({ data: payload() });
  } catch (err) {
    return apiError(err, "Saving the follow-up schedule");
  }
}
