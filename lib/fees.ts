// Partner fees: what the platform earns from each completed booking.
//
// Partners pay nothing monthly. A booking is charged once it's confirmed and
// its time slot has ended; cancelled bookings are never charged. The fee is a
// flat amount per booking, however many hours it runs.
//
// Before FLAT_FEES_FROM the fee was hourly (hours booked × the rate, capped per
// booking). Those versions stay in the history so past statements don't change,
// but they never apply to bookings from that date on.
//
// Rates live in the platform "fees" document as a history of versions, edited
// at /admin/fees. A version only applies from its `effectiveFrom`
// date, and new versions must start in the future, so editing a rate never
// changes a fee that's already been charged.
//
// Pure functions only (no storage), so they are easy to test (tests/fees.test.ts).

import { addDays } from "./time";

/** First booking date charged a flat fee. Hourly rates only apply before it. */
export const FLAT_FEES_FROM = "2026-11-02";

/** What one booking costs: a flat fee, or the legacy hourly pricing on versions saved before FLAT_FEES_FROM. */
export type FeePricing =
  | { perBooking: number }
  | {
      ratePerHour: number;
      /** Most a single booking is charged. null = no cap. */
      capPerBooking: number | null;
    };

export type FeeRate = FeePricing & {
  id: string;
  /** "platform" is everyone's default; "owner" is a promo rate for one partner. */
  scope: "platform" | "owner";
  ownerId?: string;
  /** First booking date ("YYYY-MM-DD") the rate applies to. */
  effectiveFrom: string;
  /** Last booking date a promo applies to. Platform rates don't end; a newer one replaces them. */
  until?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
};

export type FeeSchedule = { rates: FeeRate[] };

/** Used until an admin saves the first flat rate. */
export const DEFAULT_RATE: FeeRate = {
  id: "default",
  scope: "platform",
  perBooking: 15,
  effectiveFrom: FLAT_FEES_FROM,
  createdAt: "2026-11-01T00:00:00.000Z",
  createdBy: "system",
};

/** The built-in default before flat fees, kept so bookings charged under it keep their fee. */
export const LEGACY_DEFAULT_RATE: FeeRate = {
  id: "default-hourly",
  scope: "platform",
  ratePerHour: 10,
  capPerBooking: 50,
  effectiveFrom: "2000-01-01",
  createdAt: "2000-01-01T00:00:00.000Z",
  createdBy: "system",
};

export const isHourly = (r: FeePricing): r is Extract<FeePricing, { ratePerHour: number }> => "ratePerHour" in r;

export const emptySchedule = (): FeeSchedule => ({ rates: [] });

const latestFirst = (a: FeeRate, b: FeeRate) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt);

/** The rate for one partner's booking on `date`: an active promo, else the platform rate in effect then. */
export function resolveRate(schedule: FeeSchedule, ownerId: string, date: string): FeeRate {
  const applies = (r: FeeRate) => r.effectiveFrom <= date && (!r.until || date <= r.until) && !(isHourly(r) && date >= FLAT_FEES_FROM);
  const promo = schedule.rates.filter((r) => r.scope === "owner" && r.ownerId === ownerId && applies(r)).sort(latestFirst)[0];
  if (promo) return promo;
  const platform = [...schedule.rates.filter((r) => r.scope === "platform"), DEFAULT_RATE, LEGACY_DEFAULT_RATE];
  return platform.filter(applies).sort(latestFirst)[0];
}

const samePricing = (a: FeePricing, b: FeePricing) =>
  isHourly(a) ? isHourly(b) && a.ratePerHour === b.ratePerHour && a.capPerBooking === b.capPerBooking : !isHourly(b) && a.perBooking === b.perBooking;

/**
 * The partner's next price change after `today`: a scheduled platform rate, a
 * promo starting or ending, or flat fees starting. Null when none is scheduled.
 */
export function nextRateChange(schedule: FeeSchedule, ownerId: string, today: string): { from: string; rate: FeeRate } | null {
  const current = resolveRate(schedule, ownerId, today);
  const dates = new Set([FLAT_FEES_FROM]);
  for (const r of schedule.rates) {
    if (r.scope === "owner" && r.ownerId !== ownerId) continue;
    dates.add(r.effectiveFrom);
    if (r.until) dates.add(addDays(r.until, 1));
  }
  for (const from of [...dates].filter((d) => d > today).sort()) {
    const rate = resolveRate(schedule, ownerId, from);
    if (!samePricing(rate, current)) return { from, rate };
  }
  return null;
}

/** True once a rate can't apply to bookings after `today`: a promo past its end, or any hourly rate once flat fees started. */
export const hasEnded = (r: FeeRate, today: string) => (!!r.until && r.until <= today) || (isHourly(r) && today >= FLAT_FEES_FROM);

export function feeFor(rate: FeePricing, hours: number): number {
  if (!isHourly(rate)) return rate.perBooking;
  const fee = rate.ratePerHour * hours;
  return rate.capPerBooking === null ? fee : Math.min(fee, rate.capPerBooking);
}

/**
 * The rates that can apply to one partner's bookings, with admin notes and authors
 * stripped, so the public booking widget can show the fee without seeing other partners' promos.
 */
export function partnerSchedule(schedule: FeeSchedule, ownerId: string): FeeSchedule {
  return {
    rates: schedule.rates
      .filter((r) => r.scope === "platform" || r.ownerId === ownerId)
      .map((r) => {
        const copy = { ...r, createdBy: "" };
        delete copy.note;
        return copy;
      }),
  };
}

type BillableBooking = { id: string; date: string; startHour: number; hours: number; status: string; blocked?: boolean };

/** A confirmed customer booking. Courts staff blocked for themselves are never charged. */
const billable = (b: BillableBooking) => b.status === "confirmed" && !b.blocked;

/**
 * What a booking will be charged once confirmed and played, at the rate for its date,
 * so staff see it before approving. Null for blocks and cancelled bookings, which are never charged.
 */
export function bookingFee(schedule: FeeSchedule, ownerId: string, b: Pick<BillableBooking, "date" | "hours" | "status" | "blocked">): number | null {
  if (b.blocked || b.status === "cancelled") return null;
  return feeFor(resolveRate(schedule, ownerId, b.date), b.hours);
}

/**
 * Billable and its time slot is over. `now` is the facility's local date and hour.
 * No-shows are still charged: the court was held for the customer.
 */
export function isCharged(b: BillableBooking, now: { date: string; hour: number }): boolean {
  if (!billable(b)) return false;
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
    upcoming: inMonth.filter((b) => billable(b) && !isCharged(b, now)).length,
  };
}
