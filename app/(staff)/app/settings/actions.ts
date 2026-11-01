"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { platform, type PaymentSettings } from "@/lib/facility";
import { facilityNow, isValidDate } from "@/lib/time";
import { esc } from "@/lib/emails";
import { sendMail, smtpConfigured, type MailResult } from "@/lib/mailer";
import { deleteUpload, readSettings, saveUpload, UPLOAD_TYPES, writeSettings } from "@/lib/store";

// Every action here is staff-only: each one starts with requireOwner() and is scoped to that owner.

const MAX_QR_BYTES = 950 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveSettings(form: FormData): Promise<{ ok: boolean; message: string }> {
  const owner = await requireOwner();
  const current = await readSettings(owner.id);

  const downpaymentPercent = Number(form.get("downpaymentPercent"));
  const paymentWindowHours = Number(form.get("paymentWindowHours"));
  const requestWindowHours = Number(form.get("requestWindowHours"));
  const bookingWindowDays = Number(form.get("bookingWindowDays"));
  const staffNotifyEmail = String(form.get("staffNotifyEmail") ?? "").trim();
  if (!Number.isInteger(bookingWindowDays) || bookingWindowDays < 1 || bookingWindowDays > platform.maxBookingWindowDays)
    return { ok: false, message: `Customers can book 1 to ${platform.maxBookingWindowDays} days ahead.` };
  if (!Number.isInteger(downpaymentPercent) || downpaymentPercent < 0 || downpaymentPercent > 100)
    return { ok: false, message: "Downpayment must be a whole percent from 0 to 100." };
  if (!Number.isInteger(paymentWindowHours) || paymentWindowHours < 1 || paymentWindowHours > 168)
    return { ok: false, message: "Payment window must be 1 to 168 hours." };
  if (!Number.isInteger(requestWindowHours) || requestWindowHours < 1 || requestWindowHours > 168)
    return { ok: false, message: "Review window must be 1 to 168 hours." };
  if (staffNotifyEmail && !EMAIL.test(staffNotifyEmail)) return { ok: false, message: "Staff alert email isn't valid." };

  let qrPhoto = current.qrPhoto;
  const file = form.get("qr");
  if (file instanceof File && file.size > 0) {
    const ext = Object.keys(UPLOAD_TYPES).find((k) => UPLOAD_TYPES[k] === file.type);
    if (!ext) return { ok: false, message: "The QR image must be PNG, JPG or WebP." };
    if (file.size > MAX_QR_BYTES) return { ok: false, message: "That QR image is too large." };
    qrPhoto = await saveUpload(Buffer.from(await file.arrayBuffer()), ext);
  } else if (form.get("removeQr") === "1") {
    qrPhoto = null;
  }

  const next: PaymentSettings = {
    downpaymentPercent,
    paymentWindowHours,
    requestWindowHours,
    bookingWindowDays,
    closures: current.closures,
    staffNotifyEmail,
    methodName: String(form.get("methodName") ?? "").trim().slice(0, 40) || "GCash",
    accountName: String(form.get("accountName") ?? "").trim().slice(0, 80),
    accountNumber: String(form.get("accountNumber") ?? "").trim().slice(0, 40),
    instructions: String(form.get("instructions") ?? "").trim().slice(0, 500),
    qrPhoto,
  };
  await writeSettings(owner.id, next);
  if (current.qrPhoto && current.qrPhoto !== qrPhoto) await deleteUpload(current.qrPhoto);
  refresh();
  return { ok: true, message: "Settings saved." };
}

/** Closes the business, or one activity, for a day (holiday, maintenance). Existing bookings stay: cancel or move them yourself. */
export async function addClosure(date: string, activitySlug: string, note: string): Promise<{ ok: boolean; message: string }> {
  const owner = await requireOwner();
  if (!isValidDate(date) || date < facilityNow().date) return { ok: false, message: "Pick a date from today on." };
  if (activitySlug && !(await getAllActivities(owner.id)).some((a) => a.slug === activitySlug)) return { ok: false, message: "Pick an activity." };
  const settings = await readSettings(owner.id);
  if (settings.closures.some((c) => c.date === date && c.activitySlug === activitySlug)) return { ok: false, message: "That day is already closed." };
  // Keep only upcoming closures, so the list doesn't grow forever.
  const today = facilityNow().date;
  const closures = [...settings.closures.filter((c) => c.date >= today), { id: randomBytes(4).toString("hex"), date, activitySlug, note: note.trim().slice(0, 80) }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 200);
  await writeSettings(owner.id, { ...settings, closures });
  refresh();
  return { ok: true, message: "Closed. Customers can't book that day. Cancel or move any bookings you already have on it." };
}

export async function removeClosure(id: string): Promise<void> {
  const owner = await requireOwner();
  const settings = await readSettings(owner.id);
  await writeSettings(owner.id, { ...settings, closures: settings.closures.filter((c) => c.id !== id) });
  refresh();
}

export async function sendTestEmail(to: string): Promise<MailResult> {
  const owner = await requireOwner();
  if (!EMAIL.test(to.trim())) return { ok: false, detail: "Enter a valid email address." };
  const result = await sendMail({
    to: to.trim(),
    subject: `Test email from ${owner.profile.name}`,
    html: `<p>This is a test email from the ${esc(owner.profile.name)} booking system. If you can read it, email is working.</p>`,
    text: `This is a test email from the ${owner.profile.name} booking system. If you can read it, email is working.`,
  });
  return { ...result, detail: smtpConfigured() ? result.detail : `${result.detail} (set SMTP_* env vars to send for real)` };
}
