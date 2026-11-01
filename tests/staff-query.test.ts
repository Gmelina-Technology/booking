import { describe, expect, it } from "vitest";
import { pageOf, parseQuery, staffHref } from "@/app/(staff)/app/query";

const TODAY = "2030-01-14";
const parse = (sp: Record<string, string>) => parseQuery(sp, TODAY, () => true, "bookings");

describe("table pages", () => {
  it("reads ?page=, falling back to 1 for anything that isn't a page number", () => {
    expect(parse({ page: "3" }).page).toBe(3);
    for (const page of ["0", "-2", "abc", "1.5", ""]) expect(parse({ page }).page).toBe(1);
  });

  it("slices one page and clamps a page past the end to the last one", () => {
    const rows = Array.from({ length: 120 }, (_, i) => i);
    expect(pageOf(rows, 1)).toMatchObject({ page: 1, pages: 3, from: 1, to: 50 });
    expect(pageOf(rows, 3).rows).toEqual(rows.slice(100));
    expect(pageOf(rows, 9)).toMatchObject({ page: 3, from: 101, to: 120 });
    expect(pageOf([], 4)).toMatchObject({ rows: [], page: 1, pages: 1 });
  });

  it("keeps the page when opening a booking, and starts over when the list changes", () => {
    const q = parse({ view: "cancelled", page: "2" });
    expect(staffHref(q, TODAY)).toBe("/app/bookings?view=cancelled&page=2");
    expect(staffHref(q, TODAY, { booking: "AB12" })).toBe("/app/bookings?view=cancelled&booking=AB12&page=2");
    expect(staffHref(q, TODAY, { view: "confirmed" })).toBe("/app/bookings?view=confirmed");
    expect(staffHref(q, TODAY, { search: "ana" })).toBe("/app/bookings?view=cancelled&q=ana");
    expect(staffHref(q, TODAY, { page: 3 })).toBe("/app/bookings?view=cancelled&page=3");
  });

  it("leaves the page off calendar links", () => {
    const q = parse({ page: "2" });
    expect(staffHref(q, TODAY, { mode: "week" })).toBe("/app/calendar?mode=week");
  });
});
