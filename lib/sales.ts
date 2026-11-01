// Sales figures for the staff Sales page (/admin/sales).
//
// Revenue is the total of confirmed bookings, counted on the day they're
// played, so a month's figure only grows while that month's courts are used.
// A no-show only counts the downpayment that was kept, and courts staff
// blocked (maintenance, private use) aren't sales at all.
// A customer is recognised by email (or phone when there's no email); erased
// bookings still count towards revenue but not towards customers.
//
// Pure functions only (no storage), so they are easy to test (tests/sales.test.ts).

import { addMonths } from "./time";

export type SalesBooking = {
  date: string;
  hours: number;
  total: number;
  status: string;
  activitySlug: string;
  email: string;
  phone: string;
  blocked?: boolean;
  noShowAt?: string;
  downpayment?: number;
};

/** A confirmed customer booking: what counts as a sale. */
export function isSale(b: Pick<SalesBooking, "status" | "blocked">): boolean {
  return b.status === "confirmed" && !b.blocked;
}

/** What a sale earned: its total, or only the downpayment kept when the customer didn't show. */
export function revenueOf(b: Pick<SalesBooking, "total" | "noShowAt" | "downpayment">): number {
  return b.noShowAt ? (b.downpayment ?? 0) : b.total;
}

export type MonthSales = {
  /** "YYYY-MM" */
  month: string;
  revenue: number;
  /** Confirmed bookings. */
  bookings: number;
  hours: number;
  /** Different customers with a confirmed booking. */
  customers: number;
  /** Customers whose first ever confirmed booking was this month. */
  newCustomers: number;
  cancelled: number;
};

export function customerKey(b: Pick<SalesBooking, "email" | "phone">): string | null {
  const email = b.email.trim().toLowerCase();
  if (email) return `e:${email}`;
  const phone = b.phone.replace(/\D/g, "");
  return phone ? `p:${phone}` : null;
}

/** The month ("YYYY-MM") of each customer's first confirmed booking. */
export function firstMonths(bookings: SalesBooking[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const b of bookings) {
    const key = isSale(b) && customerKey(b);
    if (!key) continue;
    const month = b.date.slice(0, 7);
    const seen = first.get(key);
    if (!seen || month < seen) first.set(key, month);
  }
  return first;
}

/**
 * One month's sales. `throughDay` ("DD") stops the count after that day of
 * the month, to compare a month so far with the same days of another month.
 */
export function monthSales(bookings: SalesBooking[], month: string, first: Map<string, string>, throughDay?: string): MonthSales {
  const inMonth = bookings.filter((b) => b.date.startsWith(`${month}-`) && (!throughDay || b.date.slice(8) <= throughDay));
  const confirmed = inMonth.filter(isSale);
  const customers = new Set(confirmed.map(customerKey).filter((k) => k !== null));
  return {
    month,
    revenue: confirmed.reduce((n, b) => n + revenueOf(b), 0),
    bookings: confirmed.length,
    hours: confirmed.reduce((n, b) => n + b.hours, 0),
    customers: customers.size,
    newCustomers: [...customers].filter((k) => first.get(k) === month).length,
    cancelled: inMonth.filter((b) => b.status === "cancelled").length,
  };
}

/** The `count` months ending with `month`, oldest first. */
export function monthsEnding(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(`${month}-01`, i - count + 1).slice(0, 7));
}

export type ActivitySales = { slug: string; revenue: number; bookings: number; previous: number };

/** Confirmed revenue per activity in `month`, with the previous month's for comparison, highest first. */
export function salesByActivity(bookings: SalesBooking[], month: string, previousMonth: string, throughDay?: string): ActivitySales[] {
  const rows = new Map<string, ActivitySales>();
  const row = (slug: string) => rows.get(slug) ?? rows.set(slug, { slug, revenue: 0, bookings: 0, previous: 0 }).get(slug)!;
  for (const b of bookings) {
    if (!isSale(b) || (throughDay && b.date.slice(8) > throughDay)) continue;
    if (b.date.startsWith(`${month}-`)) {
      const r = row(b.activitySlug);
      r.revenue += revenueOf(b);
      r.bookings += 1;
    } else if (b.date.startsWith(`${previousMonth}-`)) {
      row(b.activitySlug).previous += revenueOf(b);
    }
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.previous - a.previous);
}

/** Change from `previous` to `current` as a fraction (0.25 = up 25%), or null when there's nothing to compare with. */
export function growth(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}
