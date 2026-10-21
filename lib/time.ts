import { platform } from "./facility";

/** Current date ("YYYY-MM-DD") and hour in the facility's time zone. */
export function facilityNow(now: Date = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: platform.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The dates customers can currently book, starting today. */
export function bookableDates(today: string): string[] {
  return Array.from({ length: platform.bookingWindowDays }, (_, i) => addDays(today, i));
}

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(platform.locale, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...opts,
  });
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`));
}

// ---- Calendar arithmetic on "YYYY-MM-DD" dates (no time zone involved) ----

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The Sunday on or before `date`. */
export function startOfWeek(date: string): string {
  return addDays(date, -dayOfWeek(date));
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

/** Same day `months` later, clamped to the end of the month (Jan 31 + 1 → Feb 28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** Sunday-to-Saturday weeks covering the month that contains `date`. */
export function monthWeeks(date: string): string[][] {
  const last = endOfMonth(date);
  const weeks: string[][] = [];
  for (let day = startOfWeek(startOfMonth(date)); day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
  }
  return weeks;
}

/** ISO 8601 week number. */
export function isoWeek(date: string): number {
  const thursday = addDays(date, 3 - ((dayOfWeek(date) + 6) % 7));
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor((Date.parse(`${thursday}T00:00:00Z`) - Date.parse(`${jan1}T00:00:00Z`)) / 86400_000 / 7) + 1;
}
