// Phone numbers for WhatsApp: turns whatever was typed (or came in over HL7)
// into digits with the country code, e.g. 201012345678, and says why a number
// isn't usable. Pure functions with no imports, so the browser can use them too.

export type Country = { code: string; name: string };

/** Offered next to the number on the patient page. Egypt first: it's the default. */
export const COUNTRIES: Country[] = [
  { code: "20", name: "Egypt" },
  { code: "966", name: "Saudi Arabia" },
  { code: "971", name: "United Arab Emirates" },
  { code: "965", name: "Kuwait" },
  { code: "974", name: "Qatar" },
  { code: "973", name: "Bahrain" },
  { code: "968", name: "Oman" },
  { code: "962", name: "Jordan" },
  { code: "961", name: "Lebanon" },
  { code: "964", name: "Iraq" },
  { code: "218", name: "Libya" },
  { code: "249", name: "Sudan" },
  { code: "44", name: "United Kingdom" },
  { code: "1", name: "United States / Canada" },
  { code: "49", name: "Germany" },
  { code: "33", name: "France" },
];

export const DEFAULT_COUNTRY_CODE = "20";

/**
 * ok: `phone` is the number as digits with the country code (what WhatsApp is sent to);
 * `stored` is the same with a leading + (how it is kept in the database, so that
 * normalizing it again can never add the country code twice).
 */
export type PhoneResult = { ok: true; phone: string; stored: string } | { ok: false; error: string };

// Egyptian mobile numbers: 01 followed by 9 digits (010, 011, 012, 015 …) once the leading 0 is dropped: 1 + 9 digits
const EGYPT_NATIONAL = /^1\d{9}$/;

// E.164 allows at most 15 digits in total, country code included
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * Normalizes a number for the chosen country (default Egypt). Returns the full
 * number as digits only, with the country code and no "+" or leading zeros:
 *
 *   01012345678, 1012345678, +201012345678, 00201012345678  ->  201012345678
 *   2001012345678 (a 0 left in after +20)                   ->  201012345678
 */
export function normalizePhone(raw: string | null | undefined, countryCode: string = DEFAULT_COUNTRY_CODE): PhoneResult {
  const cc = countryCode.replace(/\D/g, "");
  if (!cc) return { ok: false, error: "Choose the country" };

  const text = (raw ?? "").trim();
  if (!text) return { ok: false, error: "Enter a phone number" };
  if (/[^\d\s+\-().]/.test(text)) return { ok: false, error: "Use digits only (spaces, dashes and + are fine)" };

  let digits = text.replace(/\D/g, "");
  if (!digits) return { ok: false, error: "Enter a phone number" };

  // "+" or "00" in front means the country code is part of what was typed
  const international = text.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Egypt's own mobile numbers never start with 20, so a leading 20 is always the country code there.
  // For other countries a leading match could be part of the number, so it only counts when marked with + / 00.
  const hasCode = international || (cc === DEFAULT_COUNTRY_CODE && digits.startsWith(cc));
  let national = digits;
  if (hasCode) {
    if (!digits.startsWith(cc)) {
      return { ok: false, error: `The number starts with a different country code than +${cc}` };
    }
    national = digits.slice(cc.length);
  }

  // The 0 people dial before a national number is not part of the international one:
  // +20 followed by 01012345678 must be 201012345678, not 2001012345678
  national = national.replace(/^0+/, "");

  if (cc === DEFAULT_COUNTRY_CODE) {
    if (!EGYPT_NATIONAL.test(national)) {
      return { ok: false, error: "Not a valid Egyptian mobile number (expected 01XXXXXXXXX)" };
    }
  } else if (cc.length + national.length < MIN_DIGITS || cc.length + national.length > MAX_DIGITS) {
    return { ok: false, error: `Not a valid number for +${cc} (${MIN_DIGITS} to ${MAX_DIGITS} digits including the country code)` };
  }

  return { ok: true, phone: cc + national, stored: `+${cc}${national}` };
}

/**
 * The country code a number carries when it is written internationally
 * ("+44 7911 123456", "0044…"), or null when it isn't, or the code isn't one we know.
 */
export function detectCountry(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  const digits = text.replace(/\D/g, "");
  const international = text.startsWith("+") || digits.startsWith("00");
  if (!international) return null;
  const rest = digits.startsWith("00") ? digits.slice(2) : digits;
  // Longest match first, so +1 never shadows a longer code
  const match = COUNTRIES.map((c) => c.code)
    .sort((a, b) => b.length - a.length)
    .find((code) => rest.startsWith(code));
  return match ?? null;
}

/** Whether a stored number can be sent to: a valid number for its country. */
export function phoneUsable(raw: string | null | undefined, countryCode: string | null | undefined): boolean {
  return !!raw && normalizePhone(raw, countryCode || DEFAULT_COUNTRY_CODE).ok;
}

/** How a full number (201012345678) is shown for editing next to its country: 01012345678. */
export function toNational(phone: string, countryCode: string): string {
  const rest = phone.startsWith(countryCode) ? phone.slice(countryCode.length) : phone;
  return countryCode === DEFAULT_COUNTRY_CODE ? `0${rest}` : rest;
}
