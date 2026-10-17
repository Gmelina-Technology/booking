"use server";

import { refresh } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { facility, type PaymentSettings } from "@/lib/facility";
import { sendMail, smtpConfigured, type MailResult } from "@/lib/mailer";
import { deleteUpload, readSettings, saveUpload, UPLOAD_TYPES, writeSettings } from "@/lib/store";

// Every action here is staff-only: each one starts with requireStaff().

const MAX_QR_BYTES = 950 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveSettings(form: FormData): Promise<{ ok: boolean; message: string }> {
  await requireStaff();
  const current = await readSettings();

  const downpaymentPercent = Number(form.get("downpaymentPercent"));
  const paymentWindowHours = Number(form.get("paymentWindowHours"));
  const staffNotifyEmail = String(form.get("staffNotifyEmail") ?? "").trim();
  if (!Number.isInteger(downpaymentPercent) || downpaymentPercent < 0 || downpaymentPercent > 100)
    return { ok: false, message: "Downpayment must be a whole percent from 0 to 100." };
  if (!Number.isInteger(paymentWindowHours) || paymentWindowHours < 1 || paymentWindowHours > 168)
    return { ok: false, message: "Payment window must be 1 to 168 hours." };
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
    staffNotifyEmail,
    methodName: String(form.get("methodName") ?? "").trim().slice(0, 40) || "GCash",
    accountName: String(form.get("accountName") ?? "").trim().slice(0, 80),
    accountNumber: String(form.get("accountNumber") ?? "").trim().slice(0, 40),
    instructions: String(form.get("instructions") ?? "").trim().slice(0, 500),
    qrPhoto,
  };
  await writeSettings(next);
  if (current.qrPhoto && current.qrPhoto !== qrPhoto) await deleteUpload(current.qrPhoto);
  refresh();
  return { ok: true, message: "Settings saved." };
}

export async function sendTestEmail(to: string): Promise<MailResult> {
  await requireStaff();
  if (!EMAIL.test(to.trim())) return { ok: false, detail: "Enter a valid email address." };
  const result = await sendMail({
    to: to.trim(),
    subject: `Test email from ${facility.name}`,
    html: `<p>This is a test email from the ${facility.name} booking system. If you can read it, email is working.</p>`,
    text: `This is a test email from the ${facility.name} booking system. If you can read it, email is working.`,
  });
  return { ...result, detail: smtpConfigured() ? result.detail : `${result.detail} (set SMTP_* env vars to send for real)` };
}
