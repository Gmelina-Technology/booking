import { formatMoney } from "./facility";
import type { FeeRate } from "./fees";

/** "₱10 per booked hour, max ₱50 per booking". Partner and admin pages only; public pages never show rates. */
export function describeRate(r: Pick<FeeRate, "ratePerHour" | "capPerBooking">) {
  const cap = r.capPerBooking === null ? ", no cap" : `, max ${formatMoney(r.capPerBooking)} per booking`;
  return `${formatMoney(r.ratePerHour)} per booked hour${cap}`;
}
