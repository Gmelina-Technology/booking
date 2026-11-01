import type { Activity, PaymentSettings } from "./facility";
import type { Booking, Owner } from "./store-types";
import { addDays } from "./time";

// What platform admins see about partners and their bookings (/admin/partners,
// /admin/all-bookings). Pure functions only, so they are easy to test
// (tests/platform-stats.test.ts).

/** A booking waiting on its partner this long is flagged for platform admins. */
export const STALE_HOURS = 24;

/**
 * When the booking started waiting on its partner, or null if it isn't: a
 * customer's request not yet approved or declined, or a payment reference not
 * yet checked. Bookings staff added themselves never wait.
 */
export function waitingSince(b: Booking): string | null {
  if (b.status === "pending") return b.staffCreated ? null : b.createdAt;
  if (b.status === "awaiting_payment" && b.paymentRef) return b.paymentSubmittedAt ?? b.createdAt;
  return null;
}

/** Waiting on its partner for more than STALE_HOURS. */
export function isStale(b: Booking, nowMs = Date.now()): boolean {
  const since = waitingSince(b);
  return !!since && nowMs - Date.parse(since) > STALE_HOURS * 3600_000;
}

/** Whole hours the booking has waited on its partner, or null if it isn't waiting. */
export function hoursWaiting(b: Booking, nowMs = Date.now()): number | null {
  const since = waitingSince(b);
  return since ? Math.floor((nowMs - Date.parse(since)) / 3600_000) : null;
}

export type PartnerStats = {
  /** Every booking, whatever its status. */
  total: number;
  /** Today or later, still holding their slot. */
  upcoming: number;
  /** Requested (or added by staff) in the last 30 days. */
  recent: number;
  /** Waiting on the partner (see waitingSince). */
  waiting: number;
  /** Of those, waiting more than STALE_HOURS. */
  stale: number;
  /** Total value of confirmed bookings. */
  confirmedValue: number;
  /** When the latest booking came in. */
  lastBookingAt: string | null;
};

/** One partner's numbers, from their bookings. `today` is the facility's date. */
export function partnerStats(bookings: Booking[], today: string, nowMs = Date.now()): PartnerStats {
  const since = addDays(today, -30);
  let lastBookingAt: string | null = null;
  for (const b of bookings) if (!lastBookingAt || b.createdAt > lastBookingAt) lastBookingAt = b.createdAt;
  return {
    total: bookings.length,
    upcoming: bookings.filter((b) => b.date >= today && b.status !== "cancelled").length,
    recent: bookings.filter((b) => b.createdAt.slice(0, 10) >= since).length,
    waiting: bookings.filter((b) => waitingSince(b)).length,
    stale: bookings.filter((b) => isStale(b, nowMs)).length,
    confirmedValue: bookings.reduce((sum, b) => sum + (b.status === "confirmed" ? b.total : 0), 0),
    lastBookingAt,
  };
}

/** Groups bookings by partner id. */
export function byOwner(bookings: Booking[]): Map<string, Booking[]> {
  const map = new Map<string, Booking[]>();
  for (const b of bookings) {
    const list = map.get(b.ownerId);
    if (list) list.push(b);
    else map.set(b.ownerId, [b]);
  }
  return map;
}

export type SetupCheck = { label: string; done: boolean };

/** What a partner still has to do before customers can book and pay smoothly. */
export function setupChecks(owner: Pick<Owner, "profile">, settings: PaymentSettings, activities: Activity[], stats: Pick<PartnerStats, "total">): SetupCheck[] {
  return [
    { label: "Payment QR uploaded", done: !!settings.qrPhoto },
    { label: "Payment account name and number", done: !!(settings.accountName && settings.accountNumber) },
    { label: "Contact phone on their page", done: !!owner.profile.phone },
    { label: "At least one activity open for booking", done: activities.some((a) => a.active) },
    { label: "First booking received", done: stats.total > 0 },
  ];
}

/** Joined in the last `days` days. */
export function isNewPartner(owner: Pick<Owner, "createdAt">, days = 30, nowMs = Date.now()): boolean {
  return nowMs - Date.parse(owner.createdAt) < days * 86_400_000;
}
