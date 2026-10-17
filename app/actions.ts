"use server";

import { refresh } from "next/cache";
import { getActivity } from "@/lib/activities";
import { requireStaff } from "@/lib/auth";
import { insertBooking, listBookings, setBookingStatus } from "@/lib/store";
import { bookableDates, facilityNow, isValidDate } from "@/lib/time";

export type Availability = {
  date: string;
  /** Hour of day after which slots are still in the future (only set for today). */
  currentHour: number | null;
  /** resourceId -> list of booked start hours (one entry per booked hour). */
  booked: Record<string, number[]>;
};

export async function getAvailability(activitySlug: string, date: string): Promise<Availability> {
  const activity = await getActivity(activitySlug);
  if (!activity || !isValidDate(date)) throw new Error("Unknown activity or date");

  const bookings = await listBookings({ activitySlug, date });
  const booked: Record<string, number[]> = {};
  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    for (let h = b.startHour; h < b.startHour + b.hours; h++) (booked[b.resourceId] ??= []).push(h);
  }
  const now = facilityNow();
  return { date, currentHour: now.date === date ? now.hour : null, booked };
}

export type BookingResult = { ok: true; id: string } | { ok: false; error: string };

export async function createBooking(input: {
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
  const activity = await getActivity(input.activitySlug);
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
  return { ok: true, id: booking.id };
}

/** Staff only. */
export async function cancelBooking(id: string) {
  await requireStaff();
  await setBookingStatus(id, "cancelled");
  refresh();
}
