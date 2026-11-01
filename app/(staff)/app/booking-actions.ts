"use server";

import { refresh } from "next/cache";
import { getActivity, getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { bookingEmailContext, logBookingEmail } from "@/lib/booking-mail";
import { cancelledEmail, confirmedEmail, paymentRequestEmail, paymentRetryEmail, rescheduledEmail } from "@/lib/emails";
import { downpaymentFor, formatHourRange, paymentReady, type Activity } from "@/lib/facility";
import { sendMail, type MailImage, type MailResult } from "@/lib/mailer";
import { closedReason, priceFor } from "@/lib/schedule";
import { siteUrl } from "@/lib/site-url";
import {
  deleteUpload,
  holdsSlot,
  insertBooking,
  listBookings,
  readSettings,
  readUpload,
  SlotTaken,
  UPLOAD_TYPES,
  updateBooking,
  type Booking,
  type EmailKind,
  type Owner,
} from "@/lib/store";
import { facilityNow, formatDate, isValidDate } from "@/lib/time";

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
    if (err instanceof StateError || err instanceof SlotTaken) return new StateError(err.message);
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

/** Sends `mail` unless the customer has no email (walk-ins), and says what happened. */
async function tell(owner: Owner, booking: Booking, kind: EmailKind, action: string, mail: () => Promise<MailResult>): Promise<StaffResult> {
  if (!booking.email) return { ok: true, message: `${action} No email on file, so let the customer know yourself.` };
  const result = await mail();
  if (kind !== "payment_request") await logEmail(owner, booking.id, kind, result);
  return outcome(action, result);
}

async function sendConfirmation(owner: Owner, booking: Booking): Promise<MailResult> {
  return sendMail(confirmedEmail(await context(owner, booking)));
}

/**
 * pending → awaiting_payment, and email the customer the downpayment QR. For
 * activities with no downpayment: pending → confirmed, and email the confirmation.
 * A booking with no email (a phone booking staff entered) waits for payment
 * without an email: staff collect it themselves, and it's never released automatically.
 */
export async function approveBooking(id: string): Promise<StaffResult> {
  const owner = await requireOwner();
  const [settings, activities] = await Promise.all([readSettings(owner.id), getAllActivities(owner.id)]);

  const booking = await transition(owner, id, ["pending"], (b) => {
    b.approvedAt = new Date().toISOString();
    if (activities.find((a) => a.slug === b.activitySlug)?.noDownpayment) {
      b.status = "confirmed";
      b.downpayment = 0;
      return;
    }
    if (b.email && !paymentReady(settings)) throw new StateError("Add your payment QR code or account number in Payments & alerts first.");
    b.status = "awaiting_payment";
    b.downpayment = downpaymentFor(b.total, settings.downpaymentPercent);
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };

  const result =
    booking.status === "confirmed"
      ? await tell(owner, booking, "confirmed", "Approved and confirmed.", () => sendConfirmation(owner, booking))
      : await tell(owner, booking, "payment_request", "Approved.", () => sendPaymentRequest(owner, booking));
  refresh();
  return result;
}

/** Approves several requests at once (the inbox's "Approve all"). */
export async function approveBookings(ids: string[]): Promise<StaffResult> {
  await requireOwner();
  const failed: string[] = [];
  for (const id of ids.slice(0, 100)) {
    const result = await approveBooking(id);
    if (!result.ok) failed.push(`${id}: ${result.message}`);
  }
  const done = Math.min(ids.length, 100) - failed.length;
  refresh();
  return failed.length
    ? { ok: false, message: `Approved ${done}. ${failed.length} need a look: ${failed.join(" ")}` }
    : { ok: true, message: `Approved ${done} request${done === 1 ? "" : "s"}.` };
}

export async function resendPaymentEmail(id: string): Promise<StaffResult> {
  const owner = await requireOwner();
  const booking = await transition(owner, id, ["awaiting_payment"], (b) => {
    if (!b.email) throw new StateError("This booking has no email. Add one with Edit booking first.");
  });
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

  const result = await tell(owner, booking, "confirmed", "Confirmed.", () => sendConfirmation(owner, booking));
  refresh();
  return result;
}

/**
 * The customer's payment reference doesn't match anything: clear it, give
 * them a fresh payment window and ask them to enter it again.
 */
export async function rejectPaymentReference(id: string, note: string): Promise<StaffResult> {
  const owner = await requireOwner();
  const settings = await readSettings(owner.id);
  let receipt: string | undefined;
  const booking = await transition(owner, id, ["awaiting_payment"], (b) => {
    if (!b.paymentRef) throw new StateError(`Booking ${id} has no payment reference to check.`);
    receipt = b.paymentReceipt;
    b.paymentRef = undefined;
    b.paymentSubmittedAt = undefined;
    b.paymentAmount = undefined;
    b.paymentReceipt = undefined;
    // A fresh window, so the customer has time to sort it out before the slot is released.
    b.approvedAt = new Date().toISOString();
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };
  if (receipt) await deleteUpload(receipt);

  const ctx = await context(owner, booking);
  const result = await tell(owner, booking, "payment_retry", "Asked the customer to check their payment.", () =>
    sendMail(paymentRetryEmail(ctx, settings, note.trim().slice(0, 300))),
  );
  refresh();
  return result;
}

/** Records that the whole total is paid (the balance was collected at the venue). */
export async function markBalancePaid(id: string, paid: boolean): Promise<StaffResult> {
  const owner = await requireOwner();
  const booking = await transition(owner, id, ["confirmed"], (b) => {
    b.balancePaidAt = paid ? new Date().toISOString() : undefined;
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };
  refresh();
  return { ok: true, message: paid ? `Marked ${id} as paid in full.` : `Marked ${id} as not fully paid.` };
}

/**
 * Marks a confirmed booking whose time has started as a no-show (or undoes it).
 * It stays confirmed, since the court was held, but Sales only counts the
 * downpayment that was kept.
 */
export async function markNoShow(id: string, noShow: boolean): Promise<StaffResult> {
  const owner = await requireOwner();
  const now = facilityNow();
  const booking = await transition(owner, id, ["confirmed"], (b) => {
    if (b.blocked) throw new StateError("A blocked court has no customer to miss it.");
    if (noShow && (b.date > now.date || (b.date === now.date && b.startHour > now.hour)))
      throw new StateError(`Booking ${id} hasn't started yet, so it can't be a no-show.`);
    b.noShowAt = noShow ? new Date().toISOString() : undefined;
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };
  refresh();
  return { ok: true, message: noShow ? `Marked ${id} as a no-show.` : `${id} is no longer a no-show.` };
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
  if (booking.blocked) {
    refresh();
    return { ok: true, message: "Block removed. The court is free again." };
  }

  const ctx = await context(owner, booking);
  const result = await tell(owner, booking, "cancelled", "Cancelled.", () => sendMail(cancelledEmail(ctx)));
  refresh();
  return result;
}

/**
 * Erases the customer's personal details from a finished booking, e.g. when
 * they ask under the Data Privacy Act. The booking itself (time, court,
 * amounts) stays for the schedule and your records.
 */
export async function eraseCustomerDetails(id: string): Promise<StaffResult> {
  const owner = await requireOwner();
  const today = facilityNow().date;
  let receipt: string | undefined;
  const booking = await transition(owner, id, ["pending", "awaiting_payment", "confirmed", "cancelled"], (b) => {
    if (b.erasedAt) throw new StateError(`Booking ${id}'s customer details were already erased.`);
    if (b.status !== "cancelled" && b.date >= today)
      throw new StateError(`Booking ${id} is still active. Cancel it first (the customer is emailed), then erase their details.`);
    receipt = b.paymentReceipt;
    b.name = "Erased customer";
    b.email = "";
    b.phone = "";
    b.notes = "";
    b.paymentRef = undefined;
    b.paymentReceipt = undefined;
    // Email log lines name the address they went to.
    b.emails = b.emails?.map((e) => ({ ...e, detail: "Details erased" }));
    b.erasedAt = new Date().toISOString();
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };
  if (receipt) await deleteUpload(receipt);
  refresh();
  return { ok: true, message: `Customer details erased from ${id}.` };
}

// ---- Adding and editing bookings ---------------------------------------------

/** What the staff booking form edits. */
export type StaffBookingInput = {
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
};

/**
 * How a new staff booking starts:
 *   paid       walk-in who paid in full at the desk
 *   unpaid     confirmed, pays at the venue
 *   tentative  a hold to approve later (a phone booking still deciding)
 *   block      no customer: the court is closed for that time (maintenance, private use)
 */
export type NewBookingKind = "paid" | "unpaid" | "tentative" | "block";

export type NewStaffBooking = StaffBookingInput & { kind: NewBookingKind };

export type DayAvailability = {
  /** resourceId -> booked hours (one entry per hour), excluding `except`. */
  booked: Record<string, number[]>;
  /** Why the activity is closed that day for customers, or null. Staff can still book. */
  closed: string | null;
};

/** Booked hours on each court of an activity for one day, for the staff booking form. */
export async function staffAvailability(activitySlug: string, date: string, except?: string): Promise<DayAvailability> {
  const owner = await requireOwner();
  const [activity, settings] = await Promise.all([getActivity(owner.id, activitySlug), readSettings(owner.id)]);
  if (!activity || !isValidDate(date)) return { booked: {}, closed: null };
  const booked: Record<string, number[]> = {};
  for (const b of await listBookings({ ownerId: owner.id, activitySlug, date })) {
    if (!holdsSlot(b) || b.id === except) continue;
    for (let h = b.startHour; h < b.startHour + b.hours; h++) (booked[b.resourceId] ??= []).push(h);
  }
  return { booked, closed: closedReason(activity, settings.closures, date) };
}

/** Free start hours on a court that fit `hours`, for a helpful "already booked" message. */
async function freeStarts(owner: Owner, activity: Activity, input: StaffBookingInput, except?: string) {
  const day = (await listBookings({ ownerId: owner.id, activitySlug: activity.slug, date: input.date })).filter(
    (b) => holdsSlot(b) && b.resourceId === input.resourceId && b.id !== except,
  );
  const busy = new Set(day.flatMap((b) => Array.from({ length: b.hours }, (_, i) => b.startHour + i)));
  const starts: number[] = [];
  for (let h = activity.openHour; h + input.hours <= activity.closeHour; h++) {
    if (Array.from({ length: input.hours }, (_, i) => h + i).every((x) => !busy.has(x))) starts.push(h);
  }
  return starts;
}

async function takenMessage(owner: Owner, activity: Activity, input: StaffBookingInput, except?: string) {
  const starts = await freeStarts(owner, activity, input, except);
  const court = activity.resources.find((r) => r.id === input.resourceId)?.name ?? "That court";
  if (starts.length === 0) return `${court} has no free ${input.hours}-hour slot on ${formatDate(input.date)}. Try another ${activity.resourceLabel.toLowerCase()}.`;
  return `${court} is already booked for part of that time. Free ${input.hours}-hour starts: ${starts
    .slice(0, 8)
    .map((h) => formatHourRange(h, input.hours).split(" – ")[0])
    .join(", ")}${starts.length > 8 ? "…" : ""}.`;
}

/**
 * Checks the slot and customer details. `block` skips the customer checks;
 * `newSlot` refuses times that have passed (the current hour is fine, for walk-ins).
 */
function validate(activity: Activity, input: StaffBookingInput, { block, newSlot }: { block: boolean; newSlot: boolean }): string | null {
  if (!activity.resources.some((r) => r.id === input.resourceId)) return `Pick a ${activity.resourceLabel.toLowerCase()}.`;
  if (!isValidDate(input.date)) return "Pick a date.";
  const { startHour, hours } = input;
  if (!Number.isInteger(startHour) || !Number.isInteger(hours) || hours < 1) return "Pick a start time and length.";
  if (startHour < activity.openHour || startHour + hours > activity.closeHour)
    return `${activity.name} is open ${activity.openHour}:00–${activity.closeHour}:00.`;
  const now = facilityNow();
  if (newSlot && (input.date < now.date || (input.date === now.date && startHour < now.hour)))
    return "That time has already passed. Pick a time from now on.";
  if (block) return null;
  if (input.name.trim().length < 2) return "Enter the customer's name.";
  const email = input.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That email doesn't look right.";
  if (!email && input.phone.replace(/\D/g, "").length < 7) return "Enter a phone number or an email, so you can reach the customer.";
  const players = Math.round(input.players);
  if (!(players >= 1 && players <= activity.maxPlayers)) return `Players must be between 1 and ${activity.maxPlayers}.`;
  return null;
}

/**
 * Staff add a booking for a walk-in or phone customer, or block a court. Same
 * overlap check as customer bookings (insertBooking), but no emails and no
 * booking-window, closed-day or length limits: staff decide.
 */
export async function createStaffBooking(input: NewStaffBooking): Promise<StaffResult & { id?: string }> {
  const owner = await requireOwner();
  const activity = await getActivity(owner.id, input.activitySlug);
  if (!activity) return { ok: false, message: "Pick an activity." };
  if (!["paid", "unpaid", "tentative", "block"].includes(input.kind)) return { ok: false, message: "Choose how this booking starts." };
  const block = input.kind === "block";
  const error = validate(activity, input, { block, newSlot: true });
  if (error) return { ok: false, message: error };

  const booking = await insertBooking({
    ownerId: owner.id,
    activitySlug: activity.slug,
    resourceId: input.resourceId,
    date: input.date,
    startHour: input.startHour,
    hours: input.hours,
    name: block ? input.name.trim().slice(0, 100) || "Blocked" : input.name.trim().slice(0, 100),
    email: block ? "" : input.email.trim().toLowerCase(),
    phone: block ? "" : input.phone.trim().slice(0, 40),
    players: block ? 0 : Math.round(input.players),
    notes: input.notes.trim().slice(0, 500),
    total: block ? 0 : priceFor(activity, input.date, input.startHour, input.hours),
    staffCreated: true,
    ...(block ? { blocked: true } : {}),
  });
  if (!booking) return { ok: false, message: await takenMessage(owner, activity, input) };

  if (input.kind !== "tentative") {
    const settings = await readSettings(owner.id);
    const now = new Date().toISOString();
    await updateBooking(owner.id, booking.id, (b) => {
      b.status = "confirmed";
      b.approvedAt = now;
      if (input.kind === "block") return;
      b.downpayment = activity.noDownpayment ? 0 : downpaymentFor(b.total, settings.downpaymentPercent);
      if (input.kind === "paid") {
        b.paidAt = now;
        b.balancePaidAt = now;
      } else {
        // Nothing paid yet: the whole total is due at the venue.
        b.downpayment = 0;
      }
    });
  }
  refresh();
  return { ok: true, message: block ? `Blocked (${booking.id}).` : `Booked ${booking.id}.`, id: booking.id };
}

/**
 * Changes a booking: move it to another date, time or court (rescheduling), or
 * fix the customer's details. A moved booking is re-priced unless its
 * downpayment was already paid, and the customer is emailed when `notify`.
 */
export async function editBooking(id: string, input: StaffBookingInput & { notify: boolean }): Promise<StaffResult> {
  const owner = await requireOwner();
  const [activity, settings] = await Promise.all([getActivity(owner.id, input.activitySlug), readSettings(owner.id)]);
  if (!activity) return { ok: false, message: "Pick an activity." };

  let before = "";
  let moved = false;
  let blocked = false;
  const booking = await transition(owner, id, ["pending", "awaiting_payment", "confirmed"], (b) => {
    blocked = !!b.blocked;
    moved = b.activitySlug !== input.activitySlug || b.resourceId !== input.resourceId || b.date !== input.date || b.startHour !== input.startHour || b.hours !== input.hours;
    // Fixing a phone number on a booking that's under way is fine; moving it into the past isn't.
    const error = validate(activity, input, { block: blocked, newSlot: moved });
    if (error) throw new StateError(error);
    if (moved) {
      before = `${formatDate(b.date)} · ${formatHourRange(b.startHour, b.hours)}`;
      b.activitySlug = activity.slug;
      b.resourceId = input.resourceId;
      b.date = input.date;
      b.startHour = input.startHour;
      b.hours = input.hours;
      b.rescheduledAt = new Date().toISOString();
      if (!blocked) {
        b.total = priceFor(activity, input.date, input.startHour, input.hours);
        // Not paid yet: the downpayment follows the new total. Already paid: it stays as received.
        if (b.status === "awaiting_payment" && !b.paymentRef && b.downpayment)
          b.downpayment = downpaymentFor(b.total, settings.downpaymentPercent);
      }
    }
    if (blocked) {
      b.name = input.name.trim().slice(0, 100) || "Blocked";
      b.notes = input.notes.trim().slice(0, 500);
      return;
    }
    b.name = input.name.trim().slice(0, 100);
    b.email = input.email.trim().toLowerCase();
    b.phone = input.phone.trim().slice(0, 40);
    b.players = Math.round(input.players);
    b.notes = input.notes.trim().slice(0, 500);
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) {
    const taken = booking.message === new SlotTaken().message;
    return { ok: false, message: taken ? await takenMessage(owner, activity, input, id) : booking.message };
  }

  let result: StaffResult = { ok: true, message: moved ? `Moved ${id}.` : `Saved ${id}.` };
  if (moved && input.notify && !blocked) {
    const ctx = await context(owner, booking);
    result = await tell(owner, booking, "rescheduled", `Moved ${id}.`, () => sendMail(rescheduledEmail(ctx, before)));
  }
  refresh();
  return result;
}
