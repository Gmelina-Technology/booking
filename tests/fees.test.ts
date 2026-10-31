import { expect, test } from "vitest";
import { DEFAULT_RATE, feeFor, isCharged, monthlyStatement, resolveRate, type FeeRate, type FeeSchedule } from "@/lib/fees";

const rate = (r: Partial<FeeRate>): FeeRate => ({ ...DEFAULT_RATE, id: Math.random().toString(36), createdAt: "2026-01-01T00:00:00Z", ...r });
const booking = (r: Partial<{ id: string; date: string; startHour: number; hours: number; status: string }>) => ({
  id: "B1",
  date: "2026-10-10",
  startHour: 8,
  hours: 1,
  status: "confirmed",
  ...r,
});
const now = { date: "2026-10-31", hour: 12 };

test("default rate: ₱10 per hour, capped at ₱50", () => {
  expect(feeFor(DEFAULT_RATE, 1)).toBe(10);
  expect(feeFor(DEFAULT_RATE, 3)).toBe(30);
  expect(feeFor(DEFAULT_RATE, 5)).toBe(50);
  expect(feeFor(DEFAULT_RATE, 6)).toBe(50);
  expect(feeFor({ ratePerHour: 10, capPerBooking: null }, 6)).toBe(60);
});

test("empty schedule falls back to the default", () => {
  expect(resolveRate({ rates: [] }, "o1", "2026-10-10")).toBe(DEFAULT_RATE);
});

test("a future platform rate doesn't apply yet", () => {
  const schedule: FeeSchedule = { rates: [rate({ ratePerHour: 15, effectiveFrom: "2026-11-01" })] };
  expect(resolveRate(schedule, "o1", "2026-10-31").ratePerHour).toBe(10);
  expect(resolveRate(schedule, "o1", "2026-11-01").ratePerHour).toBe(15);
});

test("the latest platform rate in effect wins", () => {
  const schedule: FeeSchedule = {
    rates: [rate({ ratePerHour: 12, effectiveFrom: "2026-03-01" }), rate({ ratePerHour: 8, effectiveFrom: "2026-06-01" })],
  };
  expect(resolveRate(schedule, "o1", "2026-04-01").ratePerHour).toBe(12);
  expect(resolveRate(schedule, "o1", "2026-07-01").ratePerHour).toBe(8);
});

test("an owner promo overrides the platform rate, only for that owner and its dates", () => {
  const schedule: FeeSchedule = {
    rates: [rate({ scope: "owner", ownerId: "o1", ratePerHour: 5, capPerBooking: 20, effectiveFrom: "2026-10-01", until: "2026-10-15" })],
  };
  expect(resolveRate(schedule, "o1", "2026-10-10").ratePerHour).toBe(5);
  expect(resolveRate(schedule, "o2", "2026-10-10").ratePerHour).toBe(10);
  expect(resolveRate(schedule, "o1", "2026-10-16").ratePerHour).toBe(10);
  expect(resolveRate(schedule, "o1", "2026-09-30").ratePerHour).toBe(10);
});

test("only confirmed bookings whose slot has ended are charged", () => {
  expect(isCharged(booking({}), now)).toBe(true);
  expect(isCharged(booking({ status: "cancelled" }), now)).toBe(false);
  expect(isCharged(booking({ status: "pending" }), now)).toBe(false);
  expect(isCharged(booking({ status: "awaiting_payment" }), now)).toBe(false);
  expect(isCharged(booking({ date: "2026-10-31", startHour: 10, hours: 2 }), now)).toBe(true);
  expect(isCharged(booking({ date: "2026-10-31", startHour: 11, hours: 2 }), now)).toBe(false);
  expect(isCharged(booking({ date: "2026-11-01" }), now)).toBe(false);
});

test("monthly statement totals the month's charged bookings", () => {
  const bookings = [
    booking({ id: "A", hours: 1 }),
    booking({ id: "B", hours: 3 }),
    booking({ id: "C", hours: 6 }),
    booking({ id: "D", hours: 2, status: "cancelled" }),
    booking({ id: "E", date: "2026-09-30", hours: 2 }),
    booking({ id: "F", date: "2026-10-31", startHour: 18, hours: 2 }),
  ];
  const s = monthlyStatement(bookings, { rates: [] }, "o1", "2026-10", now);
  expect(
    s.lines.map((l) => [l.booking.id, l.fee]),
  ).toEqual([["A", 10], ["B", 30], ["C", 50]]);
  expect(s.total).toBe(90);
  expect(s.hours).toBe(10);
  expect(s.upcoming).toBe(1);
});

test("a month with no bookings costs nothing", () => {
  const s = monthlyStatement([], { rates: [] }, "o1", "2026-10", now);
  expect(s.total).toBe(0);
  expect(s.lines.length).toBe(0);
});
