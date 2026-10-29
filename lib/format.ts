// How times and durations are written on screen: 12-hour with AM / PM ("2:29 PM"), in the viewer's time zone.
// No imports, so both the server and the browser can use it.

const pad = (n: number) => n.toString().padStart(2, "0");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2:29 PM" */
export function formatTime(value: string | number | Date | null | undefined, seconds = false): string {
  const d = toDate(value);
  if (!d) return "—";
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())}${seconds ? ":" + pad(d.getSeconds()) : ""} ${h < 12 ? "AM" : "PM"}`;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "2:29 PM" for today, "Fri 16 Oct, 2:29 PM" for another day */
export function formatWhen(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  if (sameDay(d, new Date())) return formatTime(d);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${formatTime(d)}`;
}

/** "2026-10-17 2:29 PM" */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "N/A";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${formatTime(d)}`;
}

/** 5 → "5 min", 130 → "2 h 10 min", 3000 → "2 d 2 h". Takes minutes. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "—";
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 1440) return m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

/** 14 → "14 s", 134 → "2 min 14 s", 7300 → "2 h 2 min". Takes seconds. */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${Math.floor(s / 60)} min`;
  return formatMinutes(s / 60);
}

/** "Friday, 16 October 2026" for a YYYY-MM-DD key */
export function formatLongDate(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
