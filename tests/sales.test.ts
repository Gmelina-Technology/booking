import { expect, test } from "vitest";
import { customerKey, firstMonths, growth, monthSales, monthsEnding, salesByActivity, type SalesBooking } from "@/lib/sales";

const booking = (r: Partial<SalesBooking>): SalesBooking => ({
  date: "2026-10-10",
  hours: 1,
  total: 400,
  status: "confirmed",
  activitySlug: "pickleball",
  email: "ana@example.com",
  phone: "",
  ...r,
});

test("customers are matched by email, then phone; erased bookings have no customer", () => {
  expect(customerKey({ email: " Ana@Example.com ", phone: "0917" })).toBe("e:ana@example.com");
  expect(customerKey({ email: "", phone: "+63 917-123" })).toBe("p:63917123");
  expect(customerKey({ email: "", phone: "" })).toBeNull();
});

test("a month counts confirmed bookings only, plus how many were cancelled", () => {
  const all = [
    booking({ total: 400, hours: 1 }),
    booking({ total: 900, hours: 2, email: "ben@example.com" }),
    booking({ status: "pending" }),
    booking({ status: "awaiting_payment" }),
    booking({ status: "cancelled" }),
    booking({ date: "2026-09-30" }),
  ];
  const oct = monthSales(all, "2026-10", firstMonths(all));
  expect(oct).toEqual({ month: "2026-10", revenue: 1300, bookings: 2, hours: 3, customers: 2, newCustomers: 1, cancelled: 1 });
});

test("a no-show only earns its downpayment, and blocked courts aren't sales", () => {
  const all = [
    booking({ total: 400 }),
    booking({ total: 800, hours: 2, noShowAt: "2026-10-10T10:00:00Z", downpayment: 400, email: "ben@example.com" }),
    booking({ total: 0, blocked: true, email: "" }),
  ];
  const oct = monthSales(all, "2026-10", firstMonths(all));
  expect(oct).toMatchObject({ revenue: 800, bookings: 2, hours: 3, customers: 2 });
});

test("a customer is new only in the month of their first confirmed booking", () => {
  const all = [
    booking({ date: "2026-08-02", status: "cancelled", email: "cy@example.com" }),
    booking({ date: "2026-09-05" }),
    booking({ date: "2026-10-05" }),
    booking({ date: "2026-10-06", email: "cy@example.com" }),
  ];
  const first = firstMonths(all);
  expect(monthSales(all, "2026-09", first).newCustomers).toBe(1);
  expect(monthSales(all, "2026-10", first)).toMatchObject({ customers: 2, newCustomers: 1 });
});

test("throughDay compares the same days of each month", () => {
  const all = [booking({ date: "2026-09-10" }), booking({ date: "2026-09-25" }), booking({ date: "2026-10-31" })];
  const first = firstMonths(all);
  expect(monthSales(all, "2026-09", first, "15").bookings).toBe(1);
  expect(monthSales(all, "2026-09", first, "31").bookings).toBe(2);
});

test("months ending with a month, across a year boundary", () => {
  expect(monthsEnding("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("revenue by activity, with last month's alongside", () => {
  const all = [
    booking({ total: 400 }),
    booking({ total: 600, activitySlug: "tennis" }),
    booking({ total: 300, date: "2026-09-10" }),
    booking({ total: 800, date: "2026-09-12", activitySlug: "badminton" }),
    booking({ total: 999, status: "cancelled" }),
  ];
  expect(salesByActivity(all, "2026-10", "2026-09")).toEqual([
    { slug: "tennis", revenue: 600, bookings: 1, previous: 0 },
    { slug: "pickleball", revenue: 400, bookings: 1, previous: 300 },
    { slug: "badminton", revenue: 0, bookings: 0, previous: 800 },
  ]);
});

test("growth is null when there's nothing to compare with", () => {
  expect(growth(150, 100)).toBe(0.5);
  expect(growth(50, 100)).toBe(-0.5);
  expect(growth(100, 0)).toBeNull();
});
