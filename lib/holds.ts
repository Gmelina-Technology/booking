import { after } from "next/server";
import { bookingEmailContext, logBookingEmail } from "./booking-mail";
import { cancelledEmail, staffReleasedEmail } from "./emails";
import type { PaymentSettings } from "./facility";
import { sendMail } from "./mailer";
import { notify } from "./notifications";
import { getPublicOwnerById } from "./owners";
import { siteUrl } from "./site-url";
import { listBookings, readSettings, updateBooking, type Booking } from "./store";
import { facilityNow } from "./time";

// A booking holds its court while it waits on someone. Holds that have waited
// too long are released: the booking is cancelled, the slot is freed, the
// customer is emailed and staff get an in-app notification (and an email to
// the staff alert address).
//   - Approved but unpaid: once the payment window passes with no payment
//     reference entered. With a reference, the customer says they've paid, so
//     staff check and decide; those are never released automatically.
//   - Requests staff haven't reviewed: once the request window passes, or the
//     booking's start time arrives, whichever is first.
// Bookings staff entered themselves (walk-ins, phone bookings) are never
// released: the customer may have no email to be told, and staff collect
// their payment in person.
//
// This runs wherever it matters, so a slot frees up the moment someone needs it:
//   - when customers view or book a day (app/actions.ts), for that day
//   - when staff open the overview or a bookings page (app/page.tsx, app/bookings-view.tsx), for the whole business
//   - once a day for every business (app/api/cron/release-holds, vercel.json)

export const UNPAID_REASON = "The payment window passed without a payment.";
export const UNREVIEWED_REASON = "We couldn't confirm this slot in time, so it was released. Please pick another time, or contact us to book.";

type Windows = Pick<PaymentSettings, "paymentWindowHours" | "requestWindowHours">;

/** Whether the booking's start time has arrived, in the facility's time zone. */
function hasStarted(b: Pick<Booking, "date" | "startHour">, now: number) {
  const today = facilityNow(new Date(now));
  return b.date < today.date || (b.date === today.date && b.startHour <= today.hour);
}

/** Why this booking's hold should be released now, or null if it should stay. */
export function expiryReason(b: Booking, windows: Windows, now = Date.now()): string | null {
  if (b.staffCreated) return null;
  if (b.status === "awaiting_payment") {
    const overdue = !b.paymentRef && !!b.approvedAt && Date.parse(b.approvedAt) <= now - windows.paymentWindowHours * 3600_000;
    return overdue ? UNPAID_REASON : null;
  }
  if (b.status === "pending") {
    const stale = Date.parse(b.createdAt) <= now - windows.requestWindowHours * 3600_000;
    return stale || hasStarted(b, now) ? UNREVIEWED_REASON : null;
  }
  return null;
}

/** Bookings that could ever expire: cheap check before reading the owner's settings. */
const mayExpire = (b: Booking) => !b.staffCreated && ((b.status === "awaiting_payment" && !b.paymentRef) || b.status === "pending");

class StillHeld extends Error {}

/**
 * Releases the owner's expired holds and returns their ids. Checks only
 * `bookings` when given (e.g. the day already loaded), otherwise every booking
 * awaiting review or payment. Customer emails are sent after the response.
 */
export async function releaseOverdueHolds(ownerId: string, bookings?: Booking[]): Promise<Set<string>> {
  const released = new Set<string>();
  const all =
    bookings ??
    (await Promise.all([listBookings({ ownerId, status: "awaiting_payment" }), listBookings({ ownerId, status: "pending" })])).flat();
  const candidates = all.filter(mayExpire);
  if (candidates.length === 0) return released;

  const windows = await readSettings(ownerId);
  const cancelled: Booking[] = [];
  for (const candidate of candidates.filter((b) => expiryReason(b, windows))) {
    try {
      // Re-checked inside the update, in case the customer or staff acted meanwhile.
      const b = await updateBooking(ownerId, candidate.id, (b) => {
        const reason = expiryReason(b, windows);
        if (!reason) throw new StillHeld();
        b.status = "cancelled";
        b.cancelledAt = new Date().toISOString();
        b.cancelReason = reason;
      });
      if (b) cancelled.push(b);
    } catch (err) {
      if (!(err instanceof StillHeld)) throw err;
    }
  }
  if (cancelled.length === 0) return released;
  for (const b of cancelled) released.add(b.id);

  const base = await siteUrl();
  after(async () => {
    for (const b of cancelled) await notify("hold_released", b);
    const owner = await getPublicOwnerById(ownerId);
    if (!owner) return;
    for (const b of cancelled) {
      if (!b.email) continue;
      const result = await sendMail(cancelledEmail(await bookingEmailContext(ownerId, owner.profile, b, base)));
      await logBookingEmail(ownerId, b.id, "cancelled", result);
      if (!result.ok) console.error(`Release email for ${b.id} failed:`, result.detail);
    }
    // Staff may not have the dashboard open, so tell them by email too.
    if (windows.staffNotifyEmail) {
      const contexts = await Promise.all(cancelled.map((b) => bookingEmailContext(ownerId, owner.profile, b, base)));
      const result = await sendMail(staffReleasedEmail(contexts, windows.staffNotifyEmail, `${base}/app/bookings?view=cancelled`));
      if (!result.ok) console.error("Staff release email failed:", result.detail);
    }
  });
  return released;
}
