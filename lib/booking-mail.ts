import { getActivity } from "./activities";
import type { BusinessProfile } from "./facility";
import type { MailResult } from "./mailer";
import { updateBooking, type Booking, type EmailKind } from "./store";

// Shared by staff actions (app/(platform)/admin/booking-actions.ts) and the
// automatic release of unpaid holds (lib/holds.ts).

/** What the customer emails in lib/emails.ts need. `base` is siteUrl(), read while the request is still open. */
export async function bookingEmailContext(ownerId: string, business: BusinessProfile, booking: Booking, base: string) {
  return {
    booking,
    business,
    activity: await getActivity(ownerId, booking.activitySlug),
    link: booking.accessToken ? `${base}/bookings/${booking.accessToken}` : base,
  };
}

/** Records an email on the booking, so staff can see whether it went out. */
export async function logBookingEmail(ownerId: string, id: string, kind: EmailKind, result: MailResult) {
  await updateBooking(ownerId, id, (b) => {
    b.emails = [...(b.emails ?? []), { kind, at: new Date().toISOString(), ok: result.ok, detail: result.detail }];
  });
}
