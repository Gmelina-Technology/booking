import { after } from "next/server";
import { bookingEmailContext, logBookingEmail } from "./booking-mail";
import { cancelledEmail } from "./emails";
import { sendMail } from "./mailer";
import { getPublicOwnerById } from "./owners";
import { siteUrl } from "./site-url";
import { listBookings, readSettings, updateBooking, type Booking } from "./store";

// Approved bookings hold their court while the customer pays. Once the
// payment window passes with no payment reference entered, the hold is
// released: the booking is cancelled and the customer is emailed.
//
// This runs wherever it matters, so a slot frees up the moment someone needs it:
//   - when customers view or book a day (app/actions.ts), for that day
//   - when staff open the inbox (admin/page.tsx), for the whole business
//   - once a day for every business (app/api/cron/release-holds, vercel.json)
//
// Bookings with a payment reference are never released automatically: the
// customer says they've paid, so staff check and decide.

export const EXPIRED_REASON = "The payment window passed without a payment.";

/** Approved, still unpaid with no reference, and approved longer ago than the payment window. */
export function isOverdue(b: Booking, windowHours: number, now = Date.now()) {
  return b.status === "awaiting_payment" && !b.paymentRef && !!b.approvedAt && Date.parse(b.approvedAt) <= now - windowHours * 3600_000;
}

class NotOverdue extends Error {}

/**
 * Releases the owner's overdue unpaid holds and returns their ids. Checks only
 * `bookings` when given (e.g. the day already loaded), otherwise every booking
 * awaiting payment. Customer emails are sent after the response.
 */
export async function releaseOverdueHolds(ownerId: string, bookings?: Booking[]): Promise<Set<string>> {
  const released = new Set<string>();
  const unpaid = (bookings ?? (await listBookings({ ownerId, status: "awaiting_payment" }))).filter(
    (b) => b.status === "awaiting_payment" && !b.paymentRef,
  );
  if (unpaid.length === 0) return released;

  const { paymentWindowHours } = await readSettings(ownerId);
  const cancelled: Booking[] = [];
  for (const candidate of unpaid.filter((b) => isOverdue(b, paymentWindowHours))) {
    try {
      // Re-checked inside the update, in case the customer or staff acted meanwhile.
      const b = await updateBooking(ownerId, candidate.id, (b) => {
        if (!isOverdue(b, paymentWindowHours)) throw new NotOverdue();
        b.status = "cancelled";
        b.cancelledAt = new Date().toISOString();
        b.cancelReason = EXPIRED_REASON;
      });
      if (b) cancelled.push(b);
    } catch (err) {
      if (!(err instanceof NotOverdue)) throw err;
    }
  }
  if (cancelled.length === 0) return released;
  for (const b of cancelled) released.add(b.id);

  const base = await siteUrl();
  after(async () => {
    const owner = await getPublicOwnerById(ownerId);
    if (!owner) return;
    for (const b of cancelled) {
      if (!b.email) continue;
      const result = await sendMail(cancelledEmail(await bookingEmailContext(ownerId, owner.profile, b, base)));
      await logBookingEmail(ownerId, b.id, "cancelled", result);
      if (!result.ok) console.error(`Release email for ${b.id} failed:`, result.detail);
    }
  });
  return released;
}
