import { expect, test } from "vitest";
import {
  DEFAULT_RATE,
  feeFor,
  FLAT_FEES_FROM,
  hasEnded,
  isCharged,
  LEGACY_DEFAULT_RATE,
  monthlyStatement,
  nextRateChange,
  resolveRate,
  type FeeRate,
  type FeeSchedule,
} from "@/lib/fees";

const rate = (r: Partial<FeeRate>): FeeRate => ({ ...DEFAULT_RATE, id: Math.random().toString(36), createdAt: "2026-01-01T00:00:00Z", ...r }) as FeeRate;
const hourly = (r: Partial<FeeRate>): FeeRate => ({ ...LEGACY_DEFAULT_RATE, id: Math.random().toString(36), createdAt: "2026-01-01T00:00:00Z", ...r }) as FeeRate;
const booking = (r: Partial<{ id: string; date: string; startHour: number; hours: number; status: string; blocked: boolean }>) => ({
  id: "B1",
  date: "2026-11-10",
  startHour: 8,
  hours: 1,
  status: "confirmed",
  ...r,
});
const now = { date: "2026-11-30", hour: 12 };
const perBooking = (r: FeeRate) => feeFor(r, 1);

test("default rate: a flat ₱15 per booking, however long", () => {
  expect(feeFor(DEFAULT_RATE, 1)).toBe(15);
  expect(feeFor(DEFAULT_RATE, 3)).toBe(15);
  expect(feeFor(DEFAULT_RATE, 8)).toBe(15);
  expect(feeFor({ perBooking: 35 }, 6)).toBe(35);
});

test("legacy hourly pricing still computes what was charged", () => {
  expect(feeFor(LEGACY_DEFAULT_RATE, 1)).toBe(10);
  expect(feeFor(LEGACY_DEFAULT_RATE, 6)).toBe(50);
  expect(feeFor({ ratePerHour: 10, capPerBooking: null }, 6)).toBe(60);
});

test("empty schedule falls back to the built-in default for the date", () => {
  expect(resolveRate({ rates: [] }, "o1", FLAT_FEES_FROM)).toBe(DEFAULT_RATE);
  expect(resolveRate({ rates: [] }, "o1", "2026-10-10")).toBe(LEGACY_DEFAULT_RATE);
});

test("a future platform rate doesn't apply yet", () => {
  const schedule: FeeSchedule = { rates: [rate({ perBooking: 25, effectiveFrom: "2026-12-01" })] };
  expect(perBooking(resolveRate(schedule, "o1", "2026-11-30"))).toBe(15);
  expect(perBooking(resolveRate(schedule, "o1", "2026-12-01"))).toBe(25);
});

test("the latest platform rate in effect wins", () => {
  const schedule: FeeSchedule = {
    rates: [rate({ perBooking: 30, effectiveFrom: "2026-12-01" }), rate({ perBooking: 15, effectiveFrom: "2027-02-01" })],
  };
  expect(perBooking(resolveRate(schedule, "o1", "2027-01-01"))).toBe(30);
  expect(perBooking(resolveRate(schedule, "o1", "2027-03-01"))).toBe(15);
});

test("an owner promo overrides the platform rate, only for that owner and its dates", () => {
  const schedule: FeeSchedule = {
    rates: [rate({ scope: "owner", ownerId: "o1", perBooking: 5, effectiveFrom: "2026-11-05", until: "2026-11-15" })],
  };
  expect(perBooking(resolveRate(schedule, "o1", "2026-11-10"))).toBe(5);
  expect(perBooking(resolveRate(schedule, "o2", "2026-11-10"))).toBe(15);
  expect(perBooking(resolveRate(schedule, "o1", "2026-11-16"))).toBe(15);
  expect(perBooking(resolveRate(schedule, "o1", "2026-11-04"))).toBe(15);
});

test("hourly rates keep past fees but stop at the switch to flat fees", () => {
  const schedule: FeeSchedule = {
    rates: [
      hourly({ ratePerHour: 12, capPerBooking: 40, effectiveFrom: "2026-06-01" }),
      hourly({ scope: "owner", ownerId: "o1", ratePerHour: 5, capPerBooking: 20, effectiveFrom: "2026-10-01" }),
    ],
  };
  expect(feeFor(resolveRate(schedule, "o2", "2026-10-31"), 2)).toBe(24);
  expect(feeFor(resolveRate(schedule, "o1", "2026-10-31"), 2)).toBe(10);
  expect(resolveRate(schedule, "o1", FLAT_FEES_FROM)).toBe(DEFAULT_RATE);
  expect(resolveRate(schedule, "o2", FLAT_FEES_FROM)).toBe(DEFAULT_RATE);
  expect(hasEnded(schedule.rates[1], "2026-10-31")).toBe(false);
  expect(hasEnded(schedule.rates[1], FLAT_FEES_FROM)).toBe(true);
});

test("only confirmed bookings whose slot has ended are charged", () => {
  expect(isCharged(booking({}), now)).toBe(true);
  expect(isCharged(booking({ status: "cancelled" }), now)).toBe(false);
  expect(isCharged(booking({ status: "pending" }), now)).toBe(false);
  expect(isCharged(booking({ status: "awaiting_payment" }), now)).toBe(false);
  expect(isCharged(booking({ date: "2026-11-30", startHour: 10, hours: 2 }), now)).toBe(true);
  expect(isCharged(booking({ date: "2026-11-30", startHour: 11, hours: 2 }), now)).toBe(false);
  expect(isCharged(booking({ date: "2026-12-01" }), now)).toBe(false);
  // A court the partner blocked for themselves has no customer to charge for.
  expect(isCharged(booking({ blocked: true }), now)).toBe(false);
});

test("monthly statement charges each booking the flat fee", () => {
  const bookings = [
    booking({ id: "A", hours: 1 }),
    booking({ id: "B", hours: 3 }),
    booking({ id: "C", hours: 6 }),
    booking({ id: "D", hours: 2, status: "cancelled" }),
    booking({ id: "E", date: "2026-10-31", hours: 2 }),
    booking({ id: "F", date: "2026-11-30", startHour: 18, hours: 2 }),
  ];
  const s = monthlyStatement(bookings, { rates: [] }, "o1", "2026-11", now);
  expect(s.lines.map((l) => [l.booking.id, l.fee])).toEqual([["A", 15], ["B", 15], ["C", 15]]);
  expect(s.total).toBe(45);
  expect(s.upcoming).toBe(1);
});

test("a month with no bookings costs nothing", () => {
  const s = monthlyStatement([], { rates: [] }, "o1", "2026-11", now);
  expect(s.total).toBe(0);
  expect(s.lines.length).toBe(0);
});

test("the next rate change: a scheduled platform rate, or a partner's promo starting and ending", () => {
  expect(nextRateChange({ rates: [] }, "o1", "2026-11-02")).toBeNull();

  const platform: FeeSchedule = { rates: [rate({ perBooking: 25, effectiveFrom: "2026-11-03" })] };
  expect(nextRateChange(platform, "o1", "2026-11-02")).toMatchObject({ from: "2026-11-03", rate: { perBooking: 25 } });
  expect(nextRateChange(platform, "o1", "2026-11-03")).toBeNull();

  const promo: FeeSchedule = {
    rates: [rate({ scope: "owner", ownerId: "o1", perBooking: 5, effectiveFrom: "2026-11-05", until: "2026-11-15" })],
  };
  expect(nextRateChange(promo, "o1", "2026-11-02")).toMatchObject({ from: "2026-11-05", rate: { perBooking: 5 } });
  expect(nextRateChange(promo, "o1", "2026-11-10")).toMatchObject({ from: "2026-11-16", rate: { perBooking: 15 } });
  // Another partner's promo isn't their change.
  expect(nextRateChange(promo, "o2", "2026-11-02")).toBeNull();
  // A new version at the same price isn't a change.
  expect(nextRateChange({ rates: [rate({ perBooking: 15, effectiveFrom: "2026-12-01" })] }, "o1", "2026-11-02")).toBeNull();
});

test("hourly partners are told about the switch to flat fees", () => {
  expect(nextRateChange({ rates: [] }, "o1", "2026-10-20")).toMatchObject({ from: FLAT_FEES_FROM, rate: { perBooking: 15 } });
});
