import { formatHourRange, formatMoney, type Activity, type BusinessProfile, type PaymentSettings } from "./facility";
import type { Mail, MailImage } from "./mailer";
import type { Booking } from "./store";
import { formatDate } from "./time";

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type Ctx = { booking: Booking; activity?: Activity; link: string; business: BusinessProfile };

function details({ booking, activity }: Ctx) {
  const court = activity?.resources.find((r) => r.id === booking.resourceId)?.name ?? booking.resourceId;
  return [
    ["Reference", booking.id],
    ["Activity", `${activity?.name ?? booking.activitySlug} · ${court}`],
    ["Date", formatDate(booking.date, { weekday: "long", month: "long", year: "numeric" })],
    ["Time", formatHourRange(booking.startHour, booking.hours)],
    ["Players", String(booking.players)],
    ["Total", formatMoney(booking.total)],
  ];
}

function detailsHtml(ctx: Ctx, extra: string[][] = []) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">
${[...details(ctx), ...extra]
  .map(
    ([k, v]) =>
      `<tr><td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #eef0ec">${esc(k)}</td><td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #eef0ec">${esc(v)}</td></tr>`,
  )
  .join("\n")}
</table>`;
}

function detailsText(ctx: Ctx, extra: string[][] = []) {
  return [...details(ctx), ...extra].map(([k, v]) => `${k}: ${v}`).join("\n");
}

function layout(business: BusinessProfile, heading: string, color: string, body: string) {
  return `<!doctype html>
<html><body style="margin:0;background:#f7f8f4;font-family:Arial,Helvetica,sans-serif;color:#14201a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${color};color:#ffffff;padding:24px 28px">
  <div style="font-size:13px;opacity:.85">${esc(business.name)}</div>
  <div style="font-size:22px;font-weight:700;margin-top:4px">${esc(heading)}</div>
</td></tr>
<tr><td style="padding:24px 28px;font-size:15px;line-height:1.5">${body}</td></tr>
<tr><td style="padding:16px 28px;background:#f3f4f1;font-size:12px;color:#6b7280">
  ${[business.name, business.address, business.phone].filter(Boolean).map(esc).join(" · ")}
</td></tr>
</table></td></tr></table></body></html>`;
}

/** How customers reach the business: phone if set, else email. */
function contact(business: BusinessProfile) {
  return business.phone || business.email;
}

function button(link: string, label: string) {
  return `<p style="margin:24px 0"><a href="${esc(link)}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${esc(label)}</a></p>`;
}

/** Sent when staff approve a booking: amount due plus the payment QR. */
export function paymentRequestEmail(ctx: Ctx, settings: PaymentSettings, qr: MailImage | null): Mail {
  const { booking } = ctx;
  const due = booking.downpayment ?? booking.total;
  const balance = booking.total - due;
  const account = [settings.accountName, settings.accountNumber].filter(Boolean).join(" · ");
  const extra = [["Downpayment due", formatMoney(due)], ...(balance > 0 ? [["Balance at the front desk", formatMoney(balance)]] : [])];

  const html = layout(
    ctx.business,
    "Your booking is approved, please pay the downpayment",
    "#047857",
    `<p>Hi ${esc(booking.name)},</p>
<p>Good news: we've approved your booking. To lock in your slot, please pay the downpayment of
<strong>${esc(formatMoney(due))}</strong> within <strong>${settings.paymentWindowHours} hours</strong>.</p>
${detailsHtml(ctx, extra)}
<h3 style="margin:28px 0 8px;font-size:16px">Pay with ${esc(settings.methodName)}</h3>
${qr ? `<p style="text-align:center;margin:12px 0"><img src="cid:${qr.cid}" alt="${esc(settings.methodName)} payment QR code" width="240" style="width:240px;max-width:100%;border-radius:12px;border:1px solid #e5e7eb"></p>` : ""}
${account ? `<p style="text-align:center;margin:4px 0;font-weight:600">${esc(account)}</p>` : ""}
<p style="color:#374151">${esc(settings.instructions)}</p>
<p style="color:#374151">Please put <strong>${esc(booking.id)}</strong> in the payment note so we can match it to your booking.</p>
${button(ctx.link, "Enter your payment reference")}
<p style="font-size:13px;color:#6b7280">If we don't receive the downpayment in time, the slot may be released to other players.</p>`,
  );

  const text = `Hi ${booking.name},

We've approved your booking. Please pay the downpayment of ${formatMoney(due)} within ${settings.paymentWindowHours} hours to lock in your slot.

${detailsText(ctx, extra)}

Pay with ${settings.methodName}${account ? `: ${account}` : ""}
${settings.instructions}
Put ${booking.id} in the payment note.

Enter your payment reference here: ${ctx.link}
`;

  return {
    to: booking.email,
    replyTo: ctx.business.email || undefined,
    subject: `Pay your downpayment to confirm booking ${booking.id}`,
    html,
    text,
    images: qr ? [qr] : [],
  };
}

/** Sent when staff mark the downpayment as received. */
export function confirmedEmail(ctx: Ctx): Mail {
  const { booking } = ctx;
  const paid = booking.downpayment ?? 0;
  const balance = booking.total - paid;
  const extra = [
    ["Downpayment received", formatMoney(paid)],
    ...(balance > 0 ? [["Balance at the front desk", formatMoney(balance)]] : []),
  ];
  return {
    to: booking.email,
    replyTo: ctx.business.email || undefined,
    subject: `Booking ${booking.id} confirmed`,
    html: layout(
      ctx.business,
      "You're all set!",
      "#047857",
      `<p>Hi ${esc(booking.name)},</p>
<p>We've received your downpayment and your booking is confirmed. Please arrive 10 minutes early.</p>
${detailsHtml(ctx, extra)}
${button(ctx.link, "View your booking")}`,
    ),
    text: `Hi ${booking.name},

We've received your downpayment and your booking is confirmed. Please arrive 10 minutes early.

${detailsText(ctx, extra)}

View your booking: ${ctx.link}
`,
  };
}

/** Sent when staff decline or cancel a booking. */
export function cancelledEmail(ctx: Ctx): Mail {
  const { booking } = ctx;
  const reason = booking.cancelReason?.trim();
  return {
    to: booking.email,
    replyTo: ctx.business.email || undefined,
    subject: `Booking ${booking.id} cancelled`,
    html: layout(
      ctx.business,
      "Your booking was cancelled",
      "#52525b",
      `<p>Hi ${esc(booking.name)},</p>
<p>Your booking below has been cancelled.${reason ? ` Reason: <em>${esc(reason)}</em>` : ""}</p>
${detailsHtml(ctx)}
<p>Questions about a payment you've already made? Contact us at ${esc(contact(ctx.business))} and mention reference <strong>${esc(booking.id)}</strong>.</p>`,
    ),
    text: `Hi ${booking.name},

Your booking has been cancelled.${reason ? ` Reason: ${reason}` : ""}

${detailsText(ctx)}

Questions about a payment? Contact ${contact(ctx.business)} with reference ${booking.id}.
`,
  };
}

/** Alert to staff when a customer requests a booking. */
export function staffNewBookingEmail(ctx: Ctx, to: string, adminLink: string): Mail {
  const { booking } = ctx;
  const extra = [
    ["Customer", booking.name],
    ["Email", booking.email],
    ["Phone", booking.phone],
    ...(booking.notes ? [["Notes", booking.notes]] : []),
  ];
  return {
    to,
    subject: `New booking request ${booking.id}: ${ctx.activity?.name ?? booking.activitySlug}, ${booking.date}`,
    html: layout(
      ctx.business,
      "New booking request",
      "#1d4ed8",
      `<p>A customer is waiting for approval.</p>${detailsHtml(ctx, extra)}${button(adminLink, "Review in staff inbox")}`,
    ),
    text: `New booking request waiting for approval.\n\n${detailsText(ctx, extra)}\n\nReview: ${adminLink}\n`,
  };
}
