/* app/api/admin/settings/test/route.ts
 * Checks settings without saving them: does the ETIAM database open, do the
 * folders exist, and how many recent jobs does the PDF naming find a file for? */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { getAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { checkCompression, checkEtiamDb, checkFolder, checkPdfNaming, checkWhatsApp } from "@/lib/config-checks";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!(await getAdmin())) {
      return NextResponse.json({ error: "Only admins can change server settings" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const current = getConfig();
    const value = (
      key: "etiamDbPath" | "pdfDir" | "hl7Dir" | "pdfName" | "pdfMatch" | "pdfInDir" | "gsPath" | "waPhoneNumberId" | "waTemplate"
    ) =>
      typeof body[key] === "string" ? body[key].trim() : current[key];
    // A token typed on the page is tried as is; left blank, the saved one is used
    const token = typeof body.waToken === "string" && body.waToken.trim() !== "" ? body.waToken.trim() : current.waToken;

    return NextResponse.json({
      compression: checkCompression(value("pdfInDir"), value("pdfDir"), value("gsPath")),
      whatsapp: await checkWhatsApp(value("waPhoneNumberId"), token, value("waTemplate")),
      etiamDbPath: checkEtiamDb(value("etiamDbPath")),
      pdfDir: checkFolder(value("pdfDir"), "pdf"),
      hl7Dir: checkFolder(value("hl7Dir"), "hl7"),
      pdfName: checkPdfNaming(value("pdfName"), value("pdfDir"), value("pdfMatch") === "exact" ? "exact" : "contains"),
    });
  } catch (err) {
    return apiError(err, "Testing settings");
  }
}
