/* app/api/admin/settings/route.ts
 * Server settings (paths and PDF naming), set up per server from the Settings
 * page and stored in nexta.db. Saving applies them without a restart. */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { getAdmin } from "@/lib/auth";
import {
  CONFIG_DEFAULTS,
  MAX_COMPRESS_MIN_MB,
  MAX_SEND_DELAY_SECONDS,
  checkCompressionSettings,
  PDF_NAME_FIELDS,
  PDF_NAME_PRESETS,
  checkPdfNamePattern,
  checkSendSettings,
  getConfigFallbacks,
  getConfigSources,
  isValidDate,
  isValidTime,
  previewConfig,
  publicConfig,
  saveConfig,
  type ConfigKey,
} from "@/lib/config";
import { applyConfigChange, syncIfStale } from "@/lib/etiam-sync";
import { applyCompressionConfig } from "@/lib/pdf-compress";
import { kickSender } from "@/lib/sender";

export const dynamic = "force-dynamic";

async function payload() {
  return {
    // The WhatsApp token is never sent back: values only say whether one is saved
    values: publicConfig(),
    sources: getConfigSources(),
    defaults: { ...CONFIG_DEFAULTS, waToken: "" },
    fallbacks: getConfigFallbacks(),
    presets: PDF_NAME_PRESETS,
    fields: PDF_NAME_FIELDS,
    sync: await syncIfStale(),
  };
}

export async function GET() {
  try {
    if (!(await getAdmin())) {
      return NextResponse.json({ error: "Only admins can change server settings" }, { status: 403 });
    }
    return NextResponse.json(await payload());
  } catch (err) {
    return apiError(err, "Loading settings");
  }
}

const BOOLEAN_KEYS = ["debug", "autoSend", "waDryRun", "followUpAuto"] as const;
const TEXT_KEYS = ["etiamDbPath", "pdfInDir", "gsPath", "pdfMatch", "pdfDir", "hl7Dir", "pdfName", "sendFromDate", "compressFromDate", "waPhoneNumberId", "waTemplate", "waLang", "siteName", "followUpTime", "browserPath"] as const;

/**
 * Body: any of the text settings (strings), debug / autoSend / waDryRun (booleans),
 * sendDelaySeconds (number) and waToken (string); null = back to .env / default.
 * A blank waToken means "keep the saved one".
 */
export async function PUT(req: Request) {
  try {
    if (!(await getAdmin())) {
      return NextResponse.json({ error: "Only admins can change server settings" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const values: Partial<Record<ConfigKey, string | null>> = {};

    for (const key of TEXT_KEYS) {
      if (body[key] === null) values[key] = null;
      else if (typeof body[key] === "string") values[key] = body[key].trim();
    }
    for (const key of BOOLEAN_KEYS) {
      if (body[key] === null) values[key] = null;
      else if (typeof body[key] === "boolean") values[key] = body[key] ? "1" : "0";
    }
    if (body.waToken === null) values.waToken = null;
    else if (typeof body.waToken === "string" && body.waToken.trim() !== "") values.waToken = body.waToken.trim();
    if (body.sendDelaySeconds === null) values.sendDelaySeconds = null;
    else if (body.sendDelaySeconds !== undefined) {
      const seconds = Number(body.sendDelaySeconds);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_SEND_DELAY_SECONDS) {
        return NextResponse.json(
          { error: `The wait before sending must be a whole number of seconds, 0 to ${MAX_SEND_DELAY_SECONDS}` },
          { status: 400 }
        );
      }
      values.sendDelaySeconds = String(seconds);
    }

    if (body.compressMinMb === null) values.compressMinMb = null;
    else if (body.compressMinMb !== undefined) {
      const mb = Number(body.compressMinMb);
      if (!Number.isFinite(mb) || mb < 0 || mb > MAX_COMPRESS_MIN_MB) {
        return NextResponse.json(
          { error: `The smallest size to compress must be a number of MB, 0 to ${MAX_COMPRESS_MIN_MB}` },
          { status: 400 }
        );
      }
      values.compressMinMb = String(mb);
    }

    if (typeof values.pdfMatch === "string" && !["contains", "exact"].includes(values.pdfMatch)) {
      return NextResponse.json({ error: "How PDF names are matched must be 'contains' or 'exact'" }, { status: 400 });
    }

    if (typeof values.pdfName === "string") {
      const problem = checkPdfNamePattern(values.pdfName);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    if (values.etiamDbPath === "") {
      return NextResponse.json({ error: "Enter the path to ETIAM's database" }, { status: 400 });
    }
    // "" clears the start date; anything else must be a real date
    if (typeof values.sendFromDate === "string" && values.sendFromDate !== "" && !isValidDate(values.sendFromDate)) {
      return NextResponse.json({ error: "The start date must be a real date, like 2026-10-20" }, { status: 400 });
    }
    if (typeof values.compressFromDate === "string" && values.compressFromDate !== "" && !isValidDate(values.compressFromDate)) {
      return NextResponse.json({ error: "The compression date must be a real date, like 2026-10-10" }, { status: 400 });
    }
    if (typeof values.followUpTime === "string" && values.followUpTime !== "" && !isValidTime(values.followUpTime)) {
      return NextResponse.json({ error: "The follow-up time must look like 09:00" }, { status: 400 });
    }
    // Check the combination before saving, so automatic sending can't be switched on half set up
    const preview = previewConfig(values);
    const sendProblem = checkSendSettings(preview);
    if (sendProblem) return NextResponse.json({ error: sendProblem }, { status: 400 });
    const compressionProblem = checkCompressionSettings(preview);
    if (compressionProblem) return NextResponse.json({ error: compressionProblem }, { status: 400 });

    saveConfig(values);
    // Move the watchers to the new folders, recompute PDF names and re-sync
    await applyConfigChange();
    // Watch the (new) folder before compression and compress what's waiting there
    applyCompressionConfig();
    // Automatic sending may just have been switched on: look for due reports now
    kickSender();
    return NextResponse.json(await payload());
  } catch (err) {
    return apiError(err, "Saving settings");
  }
}
