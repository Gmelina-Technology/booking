"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getActivity } from "@/lib/activities";
import { clientIp } from "@/lib/auth";
import { staffNewBookingEmail } from "@/lib/emails";
import { releaseOverdueHolds } from "@/lib/holds";
import { sendMail } from "@/lib/mailer";
import { notify } from "@/lib/notifications";
import { getPublicOwnerById } from "@/lib/owners";
import { overLimit } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site-url";
import { getBookingByToken, holdsSlot, insertBooking, listBookings, readSettings, updateBooking } from "@/lib/store";
import { bookableDates, facilityNow, isValidDate } from "@/lib/time";

// Public actions: anyone can call them, so they're rate-limited per visitor IP
// (and per customer email or booking) to stop scripts holding every court or
// flooding staff inboxes. Limits are counted in the store (Postgres in production).
const HOUR_MS = 60 * 60 * 1000;
const MAX_BOOKINGS_PER_IP = 10;
const MAX_BOOKINGS_PER_EMAIL = 5;
const MAX_REFERENCES_PER_IP = 10;
const MAX_REFERENCES_PER_BOOKING = 5;

export type Availability = {
  date: string;
  /** Hour of day after which slots are still in the future (only set for today). */
  currentHour: number | null;
  /** resourceId -> list of booked start hours (one entry per booked hour). */
  booked: Record<string, number[]>;
};

export async function getAvailability(ownerId: string, activitySlug: string, date: string): Promise<Availability> {
  const activity = await getActivity(ownerId, activitySlug);
  if (!activity || !isValidDate(date)) throw new Error("Unknown activity or date");

  const bookings = await listBookings({ ownerId, activitySlug, date });
  const released = await releaseOverdueHolds(ownerId, bookings);
  const booked: Record<string, number[]> = {};
  for (const b of bookings) {
    if (!holdsSlot(b) || released.has(b.id)) continue;
    for (let h = b.startHour; h < b.startHour + b.hours; h++) (booked[b.resourceId] ??= []).push(h);
  }
  const now = facilityNow();
  return { date, currentHour: now.date === date ? now.hour : null, booked };
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
  if (!owner) return { ok: false, error: "This business isn't taking bookings." };
  const activity = await getActivity(owner.id, input.activitySlug);
  if (!activity || !activity.active) return { ok: false, error: "This activity isn't available for booking." };
  if (!activity.resources.some((r) => r.id === input.resourceId)) return { ok: false, error: "Unknown court." };

  const now = facilityNow();
  if (!bookableDates(now.date).includes(input.date)) return { ok: false, error: "That date can't be booked." };

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
    total: activity.pricePerHour * hours,
  });
  if (!booking) return { ok: false, error: "Sorry — someone just booked that slot. Please pick another time." };

  // Alert staff without making the customer wait for the notification or email.
  after(() => notify("new_request", booking));
  const { staffNotifyEmail } = await readSettings(owner.id);
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
 * Customer tells us they paid. Authorised by the secret booking-link token;
 * staff still verify the payment before confirming.
 */
export async function submitPaymentReference(token: string, reference: string): Promise<{ ok: boolean; error?: string }> {
  const ref = reference.trim();
  if (!/^[A-Za-z0-9 -]{4,40}$/.test(ref)) return { ok: false, error: "Enter the reference number from your payment receipt." };
  const tooMany = { ok: false, error: "Too many attempts. Please wait an hour, or contact the business." };
  if (await overLimit(`payref:${await clientIp()}`, MAX_REFERENCES_PER_IP, HOUR_MS)) return tooMany;
  const booking = await getBookingByToken(token);
  if (!booking) return { ok: false, error: "Booking not found." };
  if (await overLimit(`payref-booking:${booking.id}`, MAX_REFERENCES_PER_BOOKING, HOUR_MS)) return tooMany;
  if (booking.status !== "awaiting_payment") return { ok: false, error: "This booking isn't waiting for a payment." };
  const updated = await updateBooking(booking.ownerId, booking.id, (b) => {
    b.paymentRef = ref;
    b.paymentSubmittedAt = new Date().toISOString();
  });
  if (updated) after(() => notify("payment_submitted", updated));
  refresh();
  return { ok: true };
}

