// Partner fees: what the platform earns from each completed booking.
//
// Partners pay nothing monthly. A booking is charged once it's confirmed and
// its time slot has ended; cancelled bookings are never charged. The fee is
// the hours booked × the rate, capped per booking.
//
// Rates live in the platform "fees" document as a history of versions, edited
// at /admin/fees. A version only applies from its `effectiveFrom`
// date, and new versions must start in the future, so editing a rate never
// changes a fee that's already been charged.
//
// Pure functions only (no storage), so they are easy to test (tests/fees.test.ts).

export type FeeRate = {
  id: string;
  /** "platform" is everyone's default; "owner" is a promo rate for one partner. */
  scope: "platform" | "owner";
  ownerId?: string;
  ratePerHour: number;
  /** Most a single booking is charged. null = no cap. */
  capPerBooking: number | null;
  /** First booking date ("YYYY-MM-DD") the rate applies to. */
  effectiveFrom: string;
  /** Last booking date a promo applies to. Platform rates don't end; a newer one replaces them. */
  until?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
};

export type FeeSchedule = { rates: FeeRate[] };

/** Used until an admin saves the first rate. */
export const DEFAULT_RATE: FeeRate = {
  id: "default",
  scope: "platform",
  ratePerHour: 10,
  capPerBooking: 50,
  effectiveFrom: "2000-01-01",
  createdAt: "2000-01-01T00:00:00.000Z",
  createdBy: "system",
};

export const emptySchedule = (): FeeSchedule => ({ rates: [] });

const latestFirst = (a: FeeRate, b: FeeRate) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt);

/** The rate for one partner's booking on `date`: an active promo, else the platform rate in effect then. */
export function resolveRate(schedule: FeeSchedule, ownerId: string, date: string): FeeRate {
  const applies = (r: FeeRate) => r.effectiveFrom <= date && (!r.until || date <= r.until);
  const promo = schedule.rates.filter((r) => r.scope === "owner" && r.ownerId === ownerId && applies(r)).sort(latestFirst)[0];
  if (promo) return promo;
  return schedule.rates.filter((r) => r.scope === "platform" && applies(r)).sort(latestFirst)[0] ?? DEFAULT_RATE;
}

export function feeFor(rate: Pick<FeeRate, "ratePerHour" | "capPerBooking">, hours: number): number {
  const fee = rate.ratePerHour * hours;
  return rate.capPerBooking === null ? fee : Math.min(fee, rate.capPerBooking);
}

type BillableBooking = { id: string; date: string; startHour: number; hours: number; status: string };

/** Confirmed and its time slot is over. `now` is the facility's local date and hour. */
export function isCharged(b: BillableBooking, now: { date: string; hour: number }): boolean {
  if (b.status !== "confirmed") return false;
  return b.date < now.date || (b.date === now.date && b.startHour + b.hours <= now.hour);
}

export type StatementLine<B> = { booking: B; rate: FeeRate; fee: number };

/** One partner's charges for a month ("YYYY-MM"), plus confirmed bookings that will be charged once played. */
export function monthlyStatement<B extends BillableBooking>(
  bookings: B[],
  schedule: FeeSchedule,
  ownerId: string,
  month: string,
  now: { date: string; hour: number },
) {
  const inMonth = bookings.filter((b) => b.date.startsWith(`${month}-`));
  const lines: StatementLine<B>[] = inMonth
    .filter((b) => isCharged(b, now))
    .map((booking) => {
      const rate = resolveRate(schedule, ownerId, booking.date);
      return { booking, rate, fee: feeFor(rate, booking.hours) };
    });
  return {
    lines,
    total: lines.reduce((sum, l) => sum + l.fee, 0),
    hours: lines.reduce((sum, l) => sum + l.booking.hours, 0),
    upcoming: inMonth.filter((b) => b.status === "confirmed" && !isCharged(b, now)).length,
  };
}
