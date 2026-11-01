import { describe, expect, it } from "vitest";
import { closedReason, hourPrice, isPeakHour, priceFor } from "@/lib/schedule";

// 2030-01-14 is a Monday, 2030-01-19 a Saturday.
const MONDAY = "2030-01-14";
const SATURDAY = "2030-01-19";

const court = { slug: "badminton", pricePerHour: 300, peak: { pricePerHour: 400, fromHour: 17, toHour: 22, weekends: true }, closedDays: [0] };

describe("peak pricing", () => {
  it("charges the peak price in peak hours and all weekend", () => {
    expect(isPeakHour(court, MONDAY, 16)).toBe(false);
    expect(isPeakHour(court, MONDAY, 17)).toBe(true);
    expect(isPeakHour(court, MONDAY, 22)).toBe(false);
    expect(isPeakHour(court, SATURDAY, 8)).toBe(true);
    expect(hourPrice({ ...court, peak: null }, MONDAY, 18)).toBe(300);
  });

  it("prices a booking hour by hour across the change", () => {
    expect(priceFor(court, MONDAY, 15, 2)).toBe(600);
    expect(priceFor(court, MONDAY, 16, 2)).toBe(700);
    expect(priceFor(court, SATURDAY, 8, 2)).toBe(800);
  });
});

describe("closed days", () => {
  const closures = [
    { id: "a", date: "2030-01-15", activitySlug: "", note: "Holiday" },
    { id: "b", date: "2030-01-16", activitySlug: "tennis", note: "Resurfacing" },
  ];

  it("closes for whole-business closures, its own closures and weekly closed days", () => {
    expect(closedReason(court, closures, "2030-01-15")).toBe("Holiday");
    expect(closedReason(court, closures, "2030-01-16")).toBeNull();
    expect(closedReason({ slug: "tennis" }, closures, "2030-01-16")).toBe("Resurfacing");
    expect(closedReason(court, closures, "2030-01-13")).toBe("Closed on Sundays");
    expect(closedReason(court, closures, MONDAY)).toBeNull();
  });
});
