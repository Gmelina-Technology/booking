"use server";

import { refresh } from "next/cache";
import { getActivity } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { bookingEmailContext, logBookingEmail } from "@/lib/booking-mail";
import { cancelledEmail, confirmedEmail, paymentRequestEmail } from "@/lib/emails";
import { downpaymentFor } from "@/lib/facility";
import { sendMail, type MailImage, type MailResult } from "@/lib/mailer";
import { siteUrl } from "@/lib/site-url";
import { insertBooking, readSettings, readUpload, UPLOAD_TYPES, updateBooking, type Booking, type EmailKind, type Owner } from "@/lib/store";
import { facilityNow, isValidDate } from "@/lib/time";

// Every action here is staff-only: each one starts with requireOwner(), and
// only touches that owner's bookings (updateBooking checks the owner).

export type StaffResult = { ok: boolean; message: string };

class StateError extends Error {}

/** Changes the owner's booking only if it's currently in one of `from`. */
async function transition(owner: Owner, id: string, from: Booking["status"][], change: (b: Booking) => void) {
  try {
    return await updateBooking(owner.id, id, (b) => {
      if (!from.includes(b.status)) throw new StateError(`Booking ${id} is ${b.status.replace("_", " ")}, so that can't be done.`);
      change(b);
    });
  } catch (err) {
    if (err instanceof StateError) return err;
    throw err;
  }
}

function logEmail(owner: Owner, id: string, kind: EmailKind, result: MailResult) {
  return logBookingEmail(owner.id, id, kind, result);
}

async function context(owner: Owner, booking: Booking) {
  return bookingEmailContext(owner.id, owner.profile, booking, await siteUrl());
}

async function sendPaymentRequest(owner: Owner, booking: Booking): Promise<MailResult> {
  const settings = await readSettings(owner.id);
  let qr: MailImage | null = null;
  if (settings.qrPhoto) {
    const content = await readUpload(settings.qrPhoto);
    const ext = settings.qrPhoto.split(".").pop()!;
    if (content) qr = { cid: "payment-qr", filename: `payment-qr.${ext}`, content, contentType: UPLOAD_TYPES[ext] };
  }
  const result = await sendMail(paymentRequestEmail(await context(owner, booking), settings, qr));
  await logEmail(owner, booking.id, "payment_request", result);
  return result;
}

function outcome(action: string, mail: MailResult): StaffResult {
  return mail.ok ? { ok: true, message: `${action} ${mail.detail}.` } : { ok: false, message: `${action} but the email failed. ${mail.detail}` };
}

/** pending → awaiting_payment, and email the customer the downpayment QR. */
export async function approveBooking(id: string): Promise<StaffResult> {
  const owner = await requireOwner();
  const settings = await readSettings(owner.id);
  if (!settings.qrPhoto && !settings.accountNumber)
    return { ok: false, message: "Add your payment QR code or account number in Settings first." };

  const booking = await transition(owner, id, ["pending"], (b) => {
    b.status = "awaiting_payment";
    b.approvedAt = new Date().toISOString();
    b.downpayment = downpaymentFor(b.total, settings.downpaymentPercent);
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };

  const mail = await sendPaymentRequest(owner, booking);
  refresh();
  return outcome("Approved.", mail);
}

export async function resendPaymentEmail(id: string): Promise<StaffResult> {
  const owner = await requireOwner();
  const booking = await transition(owner, id, ["awaiting_payment"], () => {});
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };
  const mail = await sendPaymentRequest(owner, booking);
  refresh();
  return outcome("Resent.", mail);
}

/** awaiting_payment → confirmed, and email the customer their confirmation. */
export async function markDownpaymentReceived(id: string): Promise<StaffResult> {
  const owner = await requireOwner();
  const booking = await transition(owner, id, ["awaiting_payment"], (b) => {
    b.status = "confirmed";
    b.paidAt = new Date().toISOString();
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };

  const mail = await sendMail(confirmedEmail(await context(owner, booking)));
  await logEmail(owner, id, "confirmed", mail);
  refresh();
  return outcome("Confirmed.", mail);
}

/** Declines a request or cancels a booking, releases the slot and tells the customer. */
export async function cancelBooking(id: string, reason: string): Promise<StaffResult> {
  const owner = await requireOwner();
  const booking = await transition(owner, id, ["pending", "awaiting_payment", "confirmed"], (b) => {
    b.status = "cancelled";
    b.cancelledAt = new Date().toISOString();
    b.cancelReason = reason.trim().slice(0, 300) || undefined;
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };

  const mail = await sendMail(cancelledEmail(await context(owner, booking)));
  await logEmail(owner, id, "cancelled", mail);
  refresh();
  return outcome("Cancelled.", mail);
}

/**
 * Erases the customer's personal details from a finished booking, e.g. when
 * they ask under the Data Privacy Act. The booking itself (time, court,
 * amounts) stays for the schedule and your records.
 */
export async function eraseCustomerDetails(id: string): Promise<StaffResult> {
  const owner = await requireOwner();
  const today = facilityNow().date;
  const booking = await transition(owner, id, ["pending", "awaiting_payment", "confirmed", "cancelled"], (b) => {
    if (b.erasedAt) throw new StateError(`Booking ${id}'s customer details were already erased.`);
    if (b.status !== "cancelled" && b.date >= today)
      throw new StateError(`Booking ${id} is still active. Cancel it first (the customer is emailed), then erase their details.`);
    b.name = "Erased customer";
    b.email = "";
    b.phone = "";
    b.notes = "";
    b.paymentRef = undefined;
    // Email log lines name the address they went to.
    b.emails = b.emails?.map((e) => ({ ...e, detail: "Details erased" }));
    b.erasedAt = new Date().toISOString();
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };
  refresh();
  return { ok: true, message: `Customer details erased from ${id}.` };
}

export type NewStaffBooking = {
  activitySlug: string;
  resourceId: string;
  date: string;
  startHour: number;
  hours: number;
  name: string;
  phone: string;
  email: string;
  players: number;
  notes: string;
  /** Walk-ins who paid at the desk go straight to confirmed; phone bookings can wait for payment. */
  status: "confirmed" | "pending";
};

/**
 * Staff add a booking for a walk-in or phone customer. Same overlap check as
 * customer bookings (insertBooking), but no emails and no booking-window limit.
 */
export async function createStaffBooking(input: NewStaffBooking): Promise<StaffResult & { id?: string }> {
  const owner = await requireOwner();
  const activity = await getActivity(owner.id, input.activitySlug);
  if (!activity) return { ok: false, message: "Pick an activity." };
  if (!activity.resources.some((r) => r.id === input.resourceId)) return { ok: false, message: `Pick a ${activity.resourceLabel.toLowerCase()}.` };
  if (!isValidDate(input.date)) return { ok: false, message: "Pick a date." };

  const { startHour, hours } = input;
  if (!Number.isInteger(startHour) || !Number.isInteger(hours) || hours < 1) return { ok: false, message: "Pick a start time and length." };
  if (startHour < activity.openHour || startHour + hours > activity.closeHour)
    return { ok: false, message: `${activity.name} is open ${activity.openHour}:00–${activity.closeHour}:00.` };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (name.length < 2) return { ok: false, message: "Enter the customer's name." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "That email doesn't look right." };
  const players = Math.round(input.players);
  if (!(players >= 1 && players <= activity.maxPlayers)) return { ok: false, message: `Players must be between 1 and ${activity.maxPlayers}.` };

  const booking = await insertBooking({
    ownerId: owner.id,
    activitySlug: activity.slug,
    resourceId: input.resourceId,
    date: input.date,
    startHour,
    hours,
    name: name.slice(0, 100),
    email,
    phone: phone.slice(0, 40),
    players,
    notes: input.notes.trim().slice(0, 500),
    total: activity.pricePerHour * hours,
    staffCreated: true,
  });
  if (!booking) return { ok: false, message: "That court is already booked for part of that time." };

  if (input.status === "confirmed") {
    const settings = await readSettings(owner.id);
    const now = new Date().toISOString();
    await updateBooking(owner.id, booking.id, (b) => {
      b.status = "confirmed";
      b.approvedAt = now;
      b.paidAt = now;
      b.downpayment = downpaymentFor(b.total, settings.downpaymentPercent);
    });
  }
  refresh();
  return { ok: true, message: `Booked ${booking.id}.`, id: booking.id };
}
