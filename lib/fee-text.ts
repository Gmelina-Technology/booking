import { formatMoney } from "./facility";
import { isHourly, nextRateChange, resolveRate, type FeePricing, type FeeSchedule } from "./fees";
import { formatDate } from "./time";

/** "₱15 per booking" (or a legacy "₱10 per booked hour, max ₱50 per booking"). Partner and admin pages only; public pages never show rates. */
export function describeRate(r: FeePricing) {
  if (!isHourly(r)) return `${formatMoney(r.perBooking)} per booking`;
  const cap = r.capPerBooking === null ? ", no cap" : `, max ${formatMoney(r.capPerBooking)} per booking`;
  return `${formatMoney(r.ratePerHour)} per booked hour${cap}`;
}

/** "₱20 per booking", then "₱15 per booking from Nov 3, 2026" when the partner's rate is about to change. */
export function describePartnerRate(schedule: FeeSchedule, ownerId: string, today: string) {
  const now = describeRate(resolveRate(schedule, ownerId, today));
  const next = nextRateChange(schedule, ownerId, today);
  return next ? `${now}, then ${describeRate(next.rate)} from ${formatDate(next.from, { weekday: undefined, year: "numeric" })}` : now;
}
