/* app/api/admin/files/route.ts
 * "Find a report file": looks for an accession number or patient ID in the file names of the folder
 * where reports arrive and the folder Nexta reads from, and says which case it belongs to. */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import { findFiles } from "@/lib/overview";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const result = findFiles(new URL(req.url).searchParams.get("q") ?? "");
    if (!result) return NextResponse.json({ error: "Enter an accession number or patient ID" }, { status: 400 });
    return NextResponse.json({ data: result });
  } catch (err) {
    return apiError(err, "Looking for the file");
  }
}
