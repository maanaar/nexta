// Whether a job's report may be sent over WhatsApp right now, and if not, why
// in words for staff. One place, so the Send button, the patient page and the
// sender all agree.
import { getConfig, sendEligible, type Config } from "@/lib/config";
import type { JobRow } from "@/lib/nexta-db";
import { normalizePhone } from "@/lib/phone";

export function sendBlockedReason(job: JobRow, cfg: Config = getConfig()): string | null {
  if (job.state === "sending") return "It is being sent right now.";
  if (!job.pdf_ref) return "The PDF hasn't been found yet.";
  if (!job.whatsapp_num) return "There is no WhatsApp number yet.";
  const phone = normalizePhone(job.whatsapp_num, job.country_code);
  if (!phone.ok) return `The WhatsApp number isn't valid: ${phone.error}.`;
  if (!cfg.sendFromDate) return "Set the date to start sending from in Server settings first.";
  if (!sendEligible(job.study_date, cfg)) {
    return `This report's study date is before ${cfg.sendFromDate}, so it isn't sent over WhatsApp.`;
  }
  if (!cfg.waDryRun && (!cfg.waPhoneNumberId || !cfg.waToken || !cfg.waTemplate)) {
    return "WhatsApp isn't set up yet. Add the account details in Server settings.";
  }
  return null;
}
