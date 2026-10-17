"use server";

import { refresh } from "next/cache";
import { getActivity } from "@/lib/activities";
import { requireStaff } from "@/lib/auth";
import { cancelledEmail, confirmedEmail, paymentRequestEmail } from "@/lib/emails";
import { downpaymentFor } from "@/lib/facility";
import { sendMail, type MailImage, type MailResult } from "@/lib/mailer";
import { siteUrl } from "@/lib/site-url";
import { readSettings, readUpload, UPLOAD_TYPES, updateBooking, type Booking, type EmailKind } from "@/lib/store";

// Every action here is staff-only: each one starts with requireStaff().

export type StaffResult = { ok: boolean; message: string };

class StateError extends Error {}

/** Changes the booking only if it's currently in one of `from`. */
async function transition(id: string, from: Booking["status"][], change: (b: Booking) => void) {
  try {
    return await updateBooking(id, (b) => {
      if (!from.includes(b.status)) throw new StateError(`Booking ${id} is ${b.status.replace("_", " ")}, so that can't be done.`);
      change(b);
    });
  } catch (err) {
    if (err instanceof StateError) return err;
    throw err;
  }
}

async function logEmail(id: string, kind: EmailKind, result: MailResult) {
  await updateBooking(id, (b) => {
    b.emails = [...(b.emails ?? []), { kind, at: new Date().toISOString(), ok: result.ok, detail: result.detail }];
  });
}

async function context(booking: Booking) {
  return {
    booking,
    activity: await getActivity(booking.activitySlug),
    link: booking.accessToken ? `${await siteUrl()}/bookings/${booking.accessToken}` : await siteUrl(),
  };
}

async function sendPaymentRequest(booking: Booking): Promise<MailResult> {
  const settings = await readSettings();
  let qr: MailImage | null = null;
  if (settings.qrPhoto) {
    const content = await readUpload(settings.qrPhoto);
    const ext = settings.qrPhoto.split(".").pop()!;
    if (content) qr = { cid: "payment-qr", filename: `payment-qr.${ext}`, content, contentType: UPLOAD_TYPES[ext] };
  }
  const result = await sendMail(paymentRequestEmail(await context(booking), settings, qr));
  await logEmail(booking.id, "payment_request", result);
  return result;
}

function outcome(action: string, mail: MailResult): StaffResult {
  return mail.ok ? { ok: true, message: `${action} ${mail.detail}.` } : { ok: false, message: `${action} but the email failed. ${mail.detail}` };
}

/** pending → awaiting_payment, and email the customer the downpayment QR. */
export async function approveBooking(id: string): Promise<StaffResult> {
  await requireStaff();
  const settings = await readSettings();
  if (!settings.qrPhoto && !settings.accountNumber)
    return { ok: false, message: "Add your payment QR code or account number in Settings first." };

  const booking = await transition(id, ["pending"], (b) => {
    b.status = "awaiting_payment";
    b.approvedAt = new Date().toISOString();
    b.downpayment = downpaymentFor(b.total, settings.downpaymentPercent);
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };

  const mail = await sendPaymentRequest(booking);
  refresh();
  return outcome("Approved.", mail);
}

export async function resendPaymentEmail(id: string): Promise<StaffResult> {
  await requireStaff();
  const booking = await transition(id, ["awaiting_payment"], () => {});
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };
  const mail = await sendPaymentRequest(booking);
  refresh();
  return outcome("Resent.", mail);
}

/** awaiting_payment → confirmed, and email the customer their confirmation. */
export async function markDownpaymentReceived(id: string): Promise<StaffResult> {
  await requireStaff();
  const booking = await transition(id, ["awaiting_payment"], (b) => {
    b.status = "confirmed";
    b.paidAt = new Date().toISOString();
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };

  const mail = await sendMail(confirmedEmail(await context(booking)));
  await logEmail(id, "confirmed", mail);
  refresh();
  return outcome("Confirmed.", mail);
}

/** Declines a request or cancels a booking, releases the slot and tells the customer. */
export async function cancelBooking(id: string, reason: string): Promise<StaffResult> {
  await requireStaff();
  const booking = await transition(id, ["pending", "awaiting_payment", "confirmed"], (b) => {
    b.status = "cancelled";
    b.cancelledAt = new Date().toISOString();
    b.cancelReason = reason.trim().slice(0, 300) || undefined;
  });
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking instanceof StateError) return { ok: false, message: booking.message };

  const mail = await sendMail(cancelledEmail(await context(booking)));
  await logEmail(id, "cancelled", mail);
  refresh();
  return outcome("Cancelled.", mail);
}
