/* app/api/admin/settings/route.ts
 * Server settings (paths and PDF naming), set up per server from the Settings
 * page and stored in nexta.db. Saving applies them without a restart. */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { isAuthenticated } from "@/lib/auth";
import {
  CONFIG_DEFAULTS,
  PDF_NAME_FIELDS,
  PDF_NAME_PRESETS,
  checkPdfNamePattern,
  getConfig,
  getConfigFallbacks,
  getConfigSources,
  saveConfig,
  type ConfigKey,
} from "@/lib/config";
import { applyConfigChange, syncIfStale } from "@/lib/etiam-sync";

export const dynamic = "force-dynamic";

async function payload() {
  return {
    values: getConfig(),
    sources: getConfigSources(),
    defaults: CONFIG_DEFAULTS,
    fallbacks: getConfigFallbacks(),
    presets: PDF_NAME_PRESETS,
    fields: PDF_NAME_FIELDS,
    sync: await syncIfStale(),
  };
}

export async function GET() {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.json(await payload());
  } catch (err) {
    return apiError(err, "Loading settings");
  }
}

/** Body: any of etiamDbPath, pdfDir, hl7Dir, pdfName (strings), debug (boolean); null = back to .env / default. */
export async function PUT(req: Request) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const values: Partial<Record<ConfigKey, string | null>> = {};

    for (const key of ["etiamDbPath", "pdfDir", "hl7Dir", "pdfName"] as const) {
      if (body[key] === null) values[key] = null;
      else if (typeof body[key] === "string") values[key] = body[key].trim();
    }
    if (body.debug === null) values.debug = null;
    else if (typeof body.debug === "boolean") values.debug = body.debug ? "1" : "0";

    if (typeof values.pdfName === "string") {
      const problem = checkPdfNamePattern(values.pdfName);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    if (values.etiamDbPath === "") {
      return NextResponse.json({ error: "Enter the path to ETIAM's database" }, { status: 400 });
    }

    saveConfig(values);
    // Move the watchers to the new folders, recompute PDF names and re-sync
    await applyConfigChange();
    return NextResponse.json(await payload());
  } catch (err) {
    return apiError(err, "Saving settings");
  }
}
