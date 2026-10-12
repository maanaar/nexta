/* app/api/admin/settings/test/route.ts
 * Checks settings without saving them: does the ETIAM database open, do the
 * folders exist, and how many recent jobs does the PDF naming find a file for? */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { checkEtiamDb, checkFolder, checkPdfNaming } from "@/lib/config-checks";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const current = getConfig();
    const value = (key: "etiamDbPath" | "pdfDir" | "hl7Dir" | "pdfName") =>
      typeof body[key] === "string" ? body[key].trim() : current[key];

    return NextResponse.json({
      etiamDbPath: checkEtiamDb(value("etiamDbPath")),
      pdfDir: checkFolder(value("pdfDir"), "pdf"),
      hl7Dir: checkFolder(value("hl7Dir"), "hl7"),
      pdfName: checkPdfNaming(value("pdfName"), value("pdfDir")),
    });
  } catch (err) {
    return apiError(err, "Testing settings");
  }
}
