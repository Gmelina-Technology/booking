"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getActivity } from "@/lib/activities";
import { staffNewBookingEmail } from "@/lib/emails";
import { sendMail } from "@/lib/mailer";
import { getPublicOwnerById } from "@/lib/owners";
import { siteUrl } from "@/lib/site-url";
import { getBookingByToken, holdsSlot, insertBooking, listBookings, readSettings, updateBooking } from "@/lib/store";
import { bookableDates, facilityNow, isValidDate } from "@/lib/time";

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
  const booked: Record<string, number[]> = {};
  for (const b of bookings) {
    if (!holdsSlot(b)) continue;
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email." };
  if (phone.replace(/\D/g, "").length < 7) return { ok: false, error: "Please enter a valid phone number." };
  const players = Math.round(input.players);
  if (!(players >= 1 && players <= activity.maxPlayers))
    return { ok: false, error: `Players must be between 1 and ${activity.maxPlayers}.` };

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

  // Alert staff without making the customer wait for the email.
  const { staffNotifyEmail } = await readSettings(owner.id);
  if (staffNotifyEmail) {
    const base = await siteUrl();
    after(async () => {
      const result = await sendMail(
        staffNewBookingEmail(
          { booking, activity, business: owner.profile, link: `${base}/bookings/${booking.accessToken}` },
          staffNotifyEmail,
          `${base}/admin`,
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
  const booking = await getBookingByToken(token);
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.status !== "awaiting_payment") return { ok: false, error: "This booking isn't waiting for a payment." };
  await updateBooking(booking.ownerId, booking.id, (b) => {
    b.paymentRef = ref;
    b.paymentSubmittedAt = new Date().toISOString();
  });
  refresh();
  return { ok: true };
}

