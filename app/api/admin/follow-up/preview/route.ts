/* app/api/admin/follow-up/preview/route.ts
 * The follow-up report as it would be sent today, as a PDF (nothing is sent).
 * ?name= is who it is "for" (default: Preview); ?html=1 returns the page itself, for checking the design. */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { followUpData, renderReportHtml } from "@/lib/follow-up-report";
import { htmlToPdf } from "@/lib/html-pdf";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = new URL(req.url);
    const name = (url.searchParams.get("name") || "Preview").slice(0, 80);
    const html = renderReportHtml(await followUpData(), getConfig().siteName, name);
    if (url.searchParams.has("html")) return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });

    const pdf = await htmlToPdf(html);
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="follow-up-preview.pdf"', "Cache-Control": "no-store" },
    });
  } catch (err) {
    return apiError(err, "Making the follow-up report");
  }
}
