// When an activity can be booked and what it costs: weekly closed days,
// one-off closures (holidays, maintenance) and peak-hour prices. Shared by the
// customer booking flow (app/actions.ts), staff bookings and the booking widget.
//
// Pure functions only, so they're safe in client components and easy to test
// (tests/schedule.test.ts).

import type { Activity, Closure } from "./facility";
import { dayOfWeek } from "./time";

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Priced = Pick<Activity, "pricePerHour" | "peak">;

/** Whether `hour` on `date` is a peak hour for the activity. */
export function isPeakHour(a: Priced, date: string, hour: number): boolean {
  const peak = a.peak;
  if (!peak) return false;
  const weekday = dayOfWeek(date);
  if (peak.weekends && (weekday === 0 || weekday === 6)) return true;
  return hour >= peak.fromHour && hour < peak.toHour;
}

/** The price of one hour, starting at `hour` on `date`. */
export function hourPrice(a: Priced, date: string, hour: number): number {
  return isPeakHour(a, date, hour) ? a.peak!.pricePerHour : a.pricePerHour;
}

/** The total for `hours` hours from `startHour` on `date`, hour by hour (a booking can straddle peak and off-peak). */
export function priceFor(a: Priced, date: string, startHour: number, hours: number): number {
  let total = 0;
  for (let h = startHour; h < startHour + hours; h++) total += hourPrice(a, date, h);
  return total;
}

/**
 * Why the activity can't be booked on `date`, or null when it's open: a
 * closure for the whole business or this activity, or a weekly closed day.
 */
export function closedReason(a: Pick<Activity, "slug" | "closedDays">, closures: Closure[], date: string): string | null {
  const closure = closures.find((c) => c.date === date && (!c.activitySlug || c.activitySlug === a.slug));
  if (closure) return closure.note || "Closed";
  if (a.closedDays?.includes(dayOfWeek(date))) return `Closed on ${WEEKDAY_NAMES[dayOfWeek(date)]}s`;
  return null;
}
