import { formatMoney } from "./facility";
import { isHourly, type FeePricing } from "./fees";

/** "₱20 per booking" (or a legacy "₱10 per booked hour, max ₱50 per booking"). Partner and admin pages only; public pages never show rates. */
export function describeRate(r: FeePricing) {
  if (!isHourly(r)) return `${formatMoney(r.perBooking)} per booking`;
  const cap = r.capPerBooking === null ? ", no cap" : `, max ${formatMoney(r.capPerBooking)} per booking`;
  return `${formatMoney(r.ratePerHour)} per booked hour${cap}`;
}
