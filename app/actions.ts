"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getActivity } from "@/lib/activities";
import { clientIp } from "@/lib/auth";
import { bookingEmailContext, logBookingEmail } from "@/lib/booking-mail";
import { cancelledEmail, staffCustomerCancelledEmail, staffNewBookingEmail } from "@/lib/emails";
import { paymentReady } from "@/lib/facility";
import { releaseOverdueHolds } from "@/lib/holds";
import { sendMail } from "@/lib/mailer";
import { notify } from "@/lib/notifications";
import { getPublicOwnerById } from "@/lib/owners";
import { overLimit } from "@/lib/rate-limit";
import { closedReason, priceFor } from "@/lib/schedule";
import { siteUrl } from "@/lib/site-url";
import {
  deleteUpload,
  getBookingByToken,
  holdsSlot,
  insertBooking,
  listBookings,
  readSettings,
  saveUpload,
  updateBooking,
  UPLOAD_TYPES,
} from "@/lib/store";
import { bookableDates, facilityNow, isValidDate } from "@/lib/time";

// Public actions: anyone can call them, so they're rate-limited per visitor IP
// (and per customer email or booking) to stop scripts holding every court or
// flooding staff inboxes. Limits are counted in the store (Postgres in production).
const HOUR_MS = 60 * 60 * 1000;
const MAX_BOOKINGS_PER_IP = 10;
const MAX_BOOKINGS_PER_EMAIL = 5;
const MAX_REFERENCES_PER_IP = 10;
const MAX_REFERENCES_PER_BOOKING = 5;

const MAX_CANCELS_PER_IP = 10;
const MAX_RECEIPT_BYTES = 950 * 1024;

export type Availability = {
  date: string;
  /** Hour of day after which slots are still in the future (only set for today). */
  currentHour: number | null;
  /** resourceId -> list of booked start hours (one entry per booked hour). */
  booked: Record<string, number[]>;
  /** Why the activity is closed that day (holiday, weekly closed day), or null when open. */
  closed: string | null;
};

export async function getAvailability(ownerId: string, activitySlug: string, date: string): Promise<Availability> {
  const activity = await getActivity(ownerId, activitySlug);
  if (!activity || !isValidDate(date)) throw new Error("Unknown activity or date");

  const [bookings, settings] = await Promise.all([listBookings({ ownerId, activitySlug, date }), readSettings(ownerId)]);
  const released = await releaseOverdueHolds(ownerId, bookings);
  const booked: Record<string, number[]> = {};
  for (const b of bookings) {
    if (!holdsSlot(b) || released.has(b.id)) continue;
    for (let h = b.startHour; h < b.startHour + b.hours; h++) (booked[b.resourceId] ??= []).push(h);
  }
  const now = facilityNow();
  return { date, currentHour: now.date === date ? now.hour : null, booked, closed: closedReason(activity, settings.closures, date) };
}

/** `token` is the secret for the confirmation link, not the booking reference. */
export type BookingResult = { ok: true; token: string } | { ok: false; error: string };

export async function createBooking(input: {
  ownerId: string;
  activitySlug: string;
  resourceId: string;
  date: string;
  startHour: number;
  hours: number;
  name: string;
  email: string;
  phone: string;
  players: number;
  notes: string;
}): Promise<BookingResult> {
  const owner = await getPublicOwnerById(input.ownerId);
  if (!owner || owner.suspended) return { ok: false, error: "This business isn't taking bookings." };
  const activity = await getActivity(owner.id, input.activitySlug);
  if (!activity || !activity.active) return { ok: false, error: "This activity isn't available for booking." };
  if (!activity.resources.some((r) => r.id === input.resourceId)) return { ok: false, error: "Unknown court." };
  const settings = await readSettings(owner.id);
  if (!activity.noDownpayment && !paymentReady(settings))
    return { ok: false, error: "This business is still setting up online payments. Please contact them to book." };

  const now = facilityNow();
  if (!bookableDates(now.date, settings.bookingWindowDays).includes(input.date)) return { ok: false, error: "That date can't be booked." };
  const closed = closedReason(activity, settings.closures, input.date);
  if (closed) return { ok: false, error: `${activity.name} is closed that day (${closed}).` };

  const { startHour, hours } = input;
  if (!Number.isInteger(startHour) || !Number.isInteger(hours) || hours < 1 || hours > activity.maxHoursPerBooking)
    return { ok: false, error: `Bookings are 1–${activity.maxHoursPerBooking} hours.` };
  if (startHour < activity.openHour || startHour + hours > activity.closeHour)
    return { ok: false, error: "That time is outside opening hours." };
  if (input.date === now.date && startHour <= now.hour) return { ok: false, error: "That time has already started." };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (name.length < 2) return { ok: false, error: "Please enter your name." };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email." };
  if (phone.replace(/\D/g, "").length < 7) return { ok: false, error: "Please enter a valid phone number." };
  const players = Math.round(input.players);
  if (!(players >= 1 && players <= activity.maxPlayers))
    return { ok: false, error: `Players must be between 1 and ${activity.maxPlayers}.` };

  if (
    (await overLimit(`book:${await clientIp()}`, MAX_BOOKINGS_PER_IP, HOUR_MS)) ||
    (await overLimit(`book-email:${owner.id}:${email}`, MAX_BOOKINGS_PER_EMAIL, HOUR_MS))
  )
    return { ok: false, error: "Too many booking requests. Please wait an hour, or call the business to book." };

  // An unpaid hold past its payment window shouldn't block this slot.
  await releaseOverdueHolds(owner.id, await listBookings({ ownerId: owner.id, activitySlug: activity.slug, date: input.date }));

  const booking = await insertBooking({
    ownerId: owner.id,
    activitySlug: activity.slug,
    resourceId: input.resourceId,
    date: input.date,
    startHour,
    hours,
    name,
    email,
    phone,
    players,
    notes: input.notes.trim().slice(0, 500),
    total: priceFor(activity, input.date, startHour, hours),
  });
  if (!booking) return { ok: false, error: "Sorry — someone just booked that slot. Please pick another time." };

  // Alert staff without making the customer wait for the notification or email.
  after(() => notify("new_request", booking));
  const { staffNotifyEmail } = settings;
  if (staffNotifyEmail) {
    const base = await siteUrl();
    after(async () => {
      const result = await sendMail(
        staffNewBookingEmail(
          { booking, activity, business: owner.profile, link: `${base}/bookings/${booking.accessToken}` },
          staffNotifyEmail,
          `${base}/app/inbox`,
        ),
      );
      if (!result.ok) console.error("Staff alert email failed:", result.detail);
    });
  }
  return { ok: true, token: booking.accessToken! };
}

/**
 * Customer tells us they paid: the reference, optionally the amount and a
 * receipt screenshot (`form`: reference, amount, receipt). Authorised by the
 * secret booking-link token; staff still verify the payment before confirming.
 */
export async function submitPaymentReference(token: string, form: FormData): Promise<{ ok: boolean; error?: string }> {
  const ref = String(form.get("reference") ?? "").trim();
  if (!/^[A-Za-z0-9 -]{4,40}$/.test(ref)) return { ok: false, error: "Enter the reference number from your payment receipt." };
  const amountText = String(form.get("amount") ?? "").replace(/[₱,\s]/g, "");
  const amount = amountText ? Number(amountText) : undefined;
  if (amount !== undefined && !(amount > 0 && amount < 1_000_000)) return { ok: false, error: "Enter the amount you paid, in pesos." };
  const file = form.get("receipt");
  const receipt = file instanceof File && file.size > 0 ? file : null;
  const ext = receipt && Object.keys(UPLOAD_TYPES).find((k) => UPLOAD_TYPES[k] === receipt.type);
  if (receipt && !ext) return { ok: false, error: "The receipt must be a PNG, JPG or WebP image." };
  if (receipt && receipt.size > MAX_RECEIPT_BYTES) return { ok: false, error: "That receipt image is too large." };

  const tooMany = { ok: false, error: "Too many attempts. Please wait an hour, or contact the business." };
  if (await overLimit(`payref:${await clientIp()}`, MAX_REFERENCES_PER_IP, HOUR_MS)) return tooMany;
  const booking = await getBookingByToken(token);
  if (!booking) return { ok: false, error: "Booking not found." };
  if (await overLimit(`payref-booking:${booking.id}`, MAX_REFERENCES_PER_BOOKING, HOUR_MS)) return tooMany;
  if (booking.status !== "awaiting_payment") return { ok: false, error: "This booking isn't waiting for a payment." };

  const saved = receipt && ext ? await saveUpload(Buffer.from(await receipt.arrayBuffer()), ext) : undefined;
  let replaced: string | undefined;
  const updated = await updateBooking(booking.ownerId, booking.id, (b) => {
    b.paymentRef = ref;
    b.paymentSubmittedAt = new Date().toISOString();
    b.paymentAmount = amount;
    if (saved) {
      replaced = b.paymentReceipt;
      b.paymentReceipt = saved;
    }
  });
  if (replaced) await deleteUpload(replaced);
  if (updated) after(() => notify("payment_submitted", updated));
  refresh();
  return { ok: true };
}

/**
 * The customer cancels their own booking from its private page. Requests and
 * unpaid bookings can be cancelled any time before they start; staff are told
 * (bell and alert email), and a paid downpayment is left to the business's
 * refund policy.
 */
export async function cancelOwnBooking(token: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (await overLimit(`cancel:${await clientIp()}`, MAX_CANCELS_PER_IP, HOUR_MS))
    return { ok: false, error: "Too many attempts. Please wait an hour, or contact the business." };
  const booking = await getBookingByToken(token);
  if (!booking) return { ok: false, error: "Booking not found." };
  const now = facilityNow();
  if (booking.status === "cancelled") return { ok: false, error: "This booking is already cancelled." };
  if (booking.date < now.date || (booking.date === now.date && booking.startHour <= now.hour))
    return { ok: false, error: "This booking has already started. Please contact the business." };

  const note = reason.trim().slice(0, 300);
  const updated = await updateBooking(booking.ownerId, booking.id, (b) => {
    if (b.status === "cancelled") return;
    b.status = "cancelled";
    b.cancelledAt = new Date().toISOString();
    b.cancelledByCustomer = true;
    b.cancelReason = note ? `Cancelled by the customer: ${note}` : "Cancelled by the customer.";
  });
  if (!updated) return { ok: false, error: "Booking not found." };

  const owner = await getPublicOwnerById(booking.ownerId);
  const { staffNotifyEmail } = await readSettings(booking.ownerId);
  const base = await siteUrl();
  after(async () => {
    await notify("customer_cancelled", updated);
    if (!owner) return;
    const ctx = await bookingEmailContext(owner.id, owner.profile, updated, base);
    if (updated.email) {
      const result = await sendMail(cancelledEmail(ctx));
      await logBookingEmail(owner.id, updated.id, "cancelled", result);
    }
    if (staffNotifyEmail) {
      const result = await sendMail(staffCustomerCancelledEmail(ctx, staffNotifyEmail, `${base}/app/bookings?view=cancelled&booking=${updated.id}`));
      if (!result.ok) console.error("Staff cancel alert failed:", result.detail);
    }
  });
  refresh();
  return { ok: true };
}

