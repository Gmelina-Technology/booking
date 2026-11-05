"use server";

import { after } from "next/server";
import { clientIp } from "@/lib/auth";
import { bookingEmailContext, logBookingEmail } from "@/lib/booking-mail";
import { confirmedEmail, paymentRequestEmail, staffNewRegistrationEmail } from "@/lib/emails";
import { registerForEvent, type RegistrationInput } from "@/lib/hosted-event-ops";
import { getHostedEvent } from "@/lib/hosted-events";
import { sendMail, type MailImage } from "@/lib/mailer";
import { notify } from "@/lib/notifications";
import { getPublicOwnerById, isPaused } from "@/lib/owners";
import { overLimit } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site-url";
import { readFeeSchedule, readSettings, readUpload, UPLOAD_TYPES } from "@/lib/store";
import { facilityNow } from "@/lib/time";

// Public: anyone can register for a published event, so this is rate-limited
// per visitor IP and per email, like court requests (app/actions.ts).
const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_IP = 10;
const MAX_PER_EMAIL = 5;

export type RegisterResult = { ok: true; token: string } | { ok: false; error: string };

/** Registers for a hosted event. The player lands on their private booking page (`token`). */
export async function registerForHostedEvent(ownerId: string, eventId: string, input: RegistrationInput): Promise<RegisterResult> {
  const owner = await getPublicOwnerById(ownerId);
  if (!owner || owner.suspended) return { ok: false, error: "This business isn't taking registrations." };
  if (isPaused(owner.pause, facilityNow().date)) return { ok: false, error: "This business isn't taking new registrations right now." };
  const event = await getHostedEvent(owner.id, eventId);
  if (!event || event.status !== "published") return { ok: false, error: "This event isn't open for registration." };

  const email = String(input.email ?? "").trim().toLowerCase();
  if (
    (await overLimit(`book:${await clientIp()}`, MAX_PER_IP, HOUR_MS)) ||
    (await overLimit(`book-email:${owner.id}:${email}`, MAX_PER_EMAIL, HOUR_MS))
  )
    return { ok: false, error: "Too many registrations. Please wait an hour, or contact the business." };

  const result = await registerForEvent(owner.id, event, {
    name: String(input.name ?? ""),
    email,
    phone: String(input.phone ?? ""),
    spots: Number(input.spots),
    teamName: input.teamName === undefined ? undefined : String(input.teamName),
    teamPlayers: Array.isArray(input.teamPlayers) ? input.teamPlayers.map(String) : undefined,
    notes: String(input.notes ?? ""),
  }, { fees: await readFeeSchedule() });
  if (!result.ok) return result;
  const booking = result.value;

  const base = await siteUrl();
  after(async () => {
    await notify("event_registration", booking);
    const settings = await readSettings(owner.id);
    const ctx = await bookingEmailContext(owner.id, owner.profile, booking, base);
    if (booking.status === "awaiting_payment") {
      let qr: MailImage | null = null;
      if (settings.qrPhoto) {
        const content = await readUpload(settings.qrPhoto);
        const ext = settings.qrPhoto.split(".").pop()!;
        if (content) qr = { cid: "payment-qr", filename: `payment-qr.${ext}`, content, contentType: UPLOAD_TYPES[ext] };
      }
      await logBookingEmail(owner.id, booking.id, "payment_request", await sendMail(paymentRequestEmail(ctx, settings, qr)));
    } else {
      await logBookingEmail(owner.id, booking.id, "confirmed", await sendMail(confirmedEmail(ctx)));
    }
    if (settings.staffNotifyEmail) {
      const alert = await sendMail(staffNewRegistrationEmail(ctx, settings.staffNotifyEmail, `${base}/app/events/hosted/${event.id}`));
      if (!alert.ok) console.error("Staff registration alert failed:", alert.detail);
    }
  });
  return { ok: true, token: booking.accessToken! };
}
